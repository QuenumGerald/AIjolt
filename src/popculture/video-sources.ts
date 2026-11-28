import { finish, parsePublishedAt } from './parse.js';
import type { DraftItem, PopSource } from './types.js';

type Row = Record<string, unknown>;
const asRow = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const str = (v: unknown): string => typeof v === 'string' ? v : '';
const num = (v: unknown): number | null => {
  if (typeof v !== 'number' && (typeof v !== 'string' || !v.trim())) return null;
  const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null;
};

/** Extract JSON only, respecting escaped quotes; never evaluate publisher JavaScript. */
export function jsonAt(text: string, start: number): { value: unknown; end: number } | null {
  while (/\s/.test(text[start] ?? '') && start < text.length) start++;
  if (!['{', '['].includes(text[start])) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      if (--depth === 0) {
        try { return { value: JSON.parse(text.slice(start, i + 1)), end: i + 1 }; } catch { return null; }
      }
    }
  }
  return null;
}

function walk(value: unknown, visit: (r: Row) => void): void {
  if (Array.isArray(value)) { for (const v of value) walk(v, visit); return; }
  if (!value || typeof value !== 'object') return;
  const row = value as Row; visit(row);
  for (const child of Object.values(row)) walk(child, visit);
}

function scriptJson(html: string, id: string): unknown | null {
  const match = html.match(new RegExp(`<script\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>([\\s\\S]*?)<\\/script>`, 'i'));
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function tmzRoots(html: string): unknown[] {
  const marker = 'window.TMZ.actions.loadWidget(';
  const roots: unknown[] = [];
  let offset = 0;
  while ((offset = html.indexOf(marker, offset)) >= 0) {
    let pos = offset + marker.length;
    for (let i = 0; i < 5; i++) {
      const result = jsonAt(html, pos);
      if (!result) break;
      roots.push(result.value); pos = result.end;
      while (/\s/.test(html[pos] ?? '') && pos < html.length) pos++;
      if (html[pos] !== ',') break;
      pos++;
    }
    offset += marker.length;
  }
  return roots;
}

export function parseVideoPage(source: PopSource, html: string, now: Date, maxAgeHours: number, minScore: number): DraftItem[] {
  const roots: unknown[] = [];
  if (source.kind === 'tmz-video') roots.push(...tmzRoots(html));
  else if (source.kind === 'euronews-video') {
    const marker = 'window.getInitialServerData = () => (';
    const idx = html.indexOf(marker);
    if (idx >= 0) { const result = jsonAt(html, idx + marker.length); if (result) roots.push(result.value); }
  } else {
    const data = scriptJson(html, '__NEXT_DATA__'); if (data) roots.push(data);
  }
  if (!roots.length) throw new Error('video page data not found');
  const out: DraftItem[] = [], seen = new Set<string>();
  const add = (input: { url: string; title: string; summary: string; publishedAt: string | null; videoUrl: string; duration: number | null }) => {
    if (!input.publishedAt || !input.videoUrl || input.duration === null) return;
    const draft = finish(source, { ...input, publishedAt: input.publishedAt, videoMime: 'video/mp4', durationSeconds: input.duration }, now, maxAgeHours, minScore);
    if (draft && !seen.has(draft.url)) { seen.add(draft.url); out.push(draft); }
  };
  for (const root of roots) walk(root, row => {
    if (source.kind === 'nbc-video' && Array.isArray(row.videoAssets) && row.nativeAd !== true && (!row.liveVideoStatus || row.liveVideoStatus === 'NONE')) {
      const files = row.videoAssets.map(asRow).filter(v => /^(akamaiMp4|mp4)$/i.test(str(v.assetType)) && /\.mp4(?:\?|$)/i.test(str(v.publicUrl)));
      const asset = files.find(v => (num(v.width) ?? Infinity) <= 1280) ?? files[0];
      if (asset) add({url: str(asRow(row.url).primary), title: str(asRow(row.headline).primary), summary: str(asRow(row.description).primary), publishedAt: parsePublishedAt(str(row.datePublished)), videoUrl: str(asset.publicUrl), duration: num(asset.assetDuration)});
    }
    if (source.kind === 'tmz-video' && typeof row.kaltura_mp4_url === 'string' && row.is_unlisted !== true && row.status === 'published') {
      const slug = str(row.slug);
      if (/^[a-z0-9-]+$/i.test(slug) && html.includes(`/watch/${slug}/`)) add({url:`https://www.tmz.com/watch/${slug}/`, title:str(row.title), summary:str(row.description), publishedAt:parsePublishedAt(str(row.published_at)), videoUrl:str(row.kaltura_mp4_url), duration:num(row.duration)});
    }
    if (source.kind === 'et-video' && typeof row.mpx_downloadable_video_data_url === 'string' && row.is_promotional !== true && row.is_unlisted !== true) {
      const path = str(row.url); const url = path.startsWith('/') ? new URL(path, 'https://www.etonline.com').href : path;
      add({url, title:str(row.field_display_headline) || str(row.title), summary:str(row.video_description) || str(row.subhead), publishedAt:parsePublishedAt(str(row.display_date)), videoUrl:str(row.mpx_downloadable_video_data_url), duration:num(row.field_video_duration)});
    }
    if (source.kind === 'euronews-video' && row.article && row.video) {
      const article = asRow(row.article), video = asRow(row.video), media = asRow(video.internalVideo);
      const timestamp = num(article.publishedAt);
      if (asRow(video.playerData).isLive === true) return;
      add({url:str(article.canonical), title:str(article.title), summary:str(article.leadin), publishedAt: timestamp ? new Date(timestamp * 1000).toISOString() : null, videoUrl:str(media.url), duration: num(media.duration) === null ? null : Number(media.duration) / 1000});
    }
  });
  return out;
}
