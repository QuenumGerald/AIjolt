import { createHash } from 'node:crypto';
import { assessRelevance, freshnessScore } from './relevance.js';
import { cleanTitle, formatPost } from './posts.js';
import { assessVideo } from './video.js';
import type { DraftItem, PopSource } from './types.js';

const decode = (value: string): string => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

const strip = (value: string): string => decode(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

export function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export function parsePublishedAt(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = decode(value).trim();
  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}

const hash = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 24);

function withinAge(publishedAt: string, now: Date, maxAgeHours: number): boolean {
  const time = new Date(publishedAt).getTime();
  return time <= now.getTime() + 5 * 60_000 && now.getTime() - time <= maxAgeHours * 3_600_000;
}

function finish(source: PopSource, input: {
  url: string;
  title: string;
  summary: string;
  publishedAt: string;
  videoUrl?: string | null;
  videoMime?: string | null;
  durationSeconds?: number | null;
}, now: Date, maxAgeHours: number, minScore: number): DraftItem | null {
  const url = canonicalUrl(input.url);
  const title = cleanTitle(input.title);
  if (!url || !title || (title.match(/[A-Za-z]/g) ?? []).length < 8) return null;
  if (!withinAge(input.publishedAt, now, maxAgeHours)) return null;
  const summary = input.summary.slice(0, 600);
  const relevance = assessRelevance(title, summary, source.defaultCategory);
  const video = assessVideo({
    url: input.videoUrl,
    mime: input.videoMime,
    durationSeconds: input.durationSeconds,
    rights: source.videoRights,
  });
  if (!relevance.ok) {
    return {
      source: source.id, externalId: hash(url), url, title, summary, publisher: source.publisher,
      category: source.defaultCategory ?? 'film', publishedAt: input.publishedAt, score: 0,
      status: 'rejected', rejection: relevance.reason, postText: null, video,
    };
  }
  const score = relevance.score + freshnessScore(input.publishedAt, now, maxAgeHours);
  const postText = formatPost(title, url);
  if (!postText) {
    return {
      source: source.id, externalId: hash(url), url, title, summary, publisher: source.publisher,
      category: relevance.category, publishedAt: input.publishedAt, score,
      status: 'rejected', rejection: 'title and URL exceed 280 characters', postText: null, video,
    };
  }
  if (score < minScore) {
    return {
      source: source.id, externalId: hash(url), url, title, summary, publisher: source.publisher,
      category: relevance.category, publishedAt: input.publishedAt, score,
      status: 'rejected', rejection: 'below score threshold', postText, video,
    };
  }
  return {
    source: source.id, externalId: hash(url), url, title, summary, publisher: source.publisher,
    category: relevance.category, publishedAt: input.publishedAt, score,
    status: 'ready', rejection: null, postText, video,
  };
}

const tag = (block: string, name: string): string => {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? strip(match[1]) : '';
};

function rssVideo(block: string): { url: string; mime: string } | null {
  for (const match of block.matchAll(/<(?:media:content|enclosure|link)\b([^>]*)\/?\s*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) attrs[attr[1].toLowerCase()] = decode(attr[3]);
    const url = attrs.url || attrs.href || '';
    const mime = attrs.type || '';
    if (!url) continue;
    if (/youtube\.com|youtu\.be/i.test(url) || /video\//i.test(mime) || /mpegurl|\.m3u8|\.mp4|\.mov|\.m4v/i.test(`${mime} ${url}`)) {
      return { url, mime };
    }
  }
  const youtube = block.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+)/i);
  return youtube ? { url: youtube[0], mime: '' } : null;
}

export function parseRss(source: PopSource, xml: string, now: Date, maxAgeHours: number, minScore: number): DraftItem[] {
  const blocks = [...xml.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].map(match => match[1]);
  return blocks.flatMap(block => {
    const linkHref = block.match(/<link\b[^>]*href\s*=\s*(["'])(https:[^"']+)\1/i)?.[2];
    const url = linkHref || tag(block, 'link');
    const publishedAt = parsePublishedAt(tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'date'));
    const video = rssVideo(block);
    if (!publishedAt) return [];
    const item = finish(source, {
      url, title: tag(block, 'title'), summary: tag(block, 'description') || tag(block, 'summary'),
      publishedAt, videoUrl: video?.url, videoMime: video?.mime,
    }, now, maxAgeHours, minScore);
    return item ? [item] : [];
  });
}

export function parseJsonFeed(source: PopSource, body: string, now: Date, maxAgeHours: number, minScore: number): DraftItem[] {
  const payload = JSON.parse(body) as { items?: Array<Record<string, unknown>> };
  return (payload.items ?? []).flatMap(item => {
    const attachment = Array.isArray(item.attachments) ? item.attachments[0] as Record<string, unknown> | undefined : undefined;
    const publishedAt = parsePublishedAt(typeof item.date_published === 'string' ? item.date_published : null);
    if (!publishedAt || typeof item.url !== 'string' || typeof item.title !== 'string') return [];
    const draft = finish(source, {
      url: item.url,
      title: item.title,
      summary: typeof item.summary === 'string' ? item.summary : typeof item.content_text === 'string' ? item.content_text : '',
      publishedAt,
      videoUrl: typeof attachment?.url === 'string' ? attachment.url : null,
      videoMime: typeof attachment?.mime_type === 'string' ? attachment.mime_type : null,
      durationSeconds: typeof attachment?.duration_in_seconds === 'number' ? attachment.duration_in_seconds : null,
    }, now, maxAgeHours, minScore);
    return draft ? [draft] : [];
  });
}

export function parseKinoCheck(source: PopSource, body: string, now: Date, maxAgeHours: number, minScore: number): DraftItem[] {
  const payload = JSON.parse(body) as Record<string, unknown>;
  const rows = Object.entries(payload).filter(([key]) => key !== '_metadata').map(([, value]) => value).filter(value => value && typeof value === 'object') as Array<Record<string, unknown>>;
  return rows.flatMap(item => {
    if (item.language && item.language !== 'en') return [];
    const publishedAt = parsePublishedAt(typeof item.published === 'string' ? item.published : null);
    const page = typeof item.url === 'string' ? item.url : '';
    const youtube = typeof item.youtube_video_id === 'string' ? `https://www.youtube.com/watch?v=${item.youtube_video_id}` : null;
    if (!publishedAt || !page || typeof item.title !== 'string') return [];
    const draft = finish(source, {
      url: page.startsWith('http') ? page : `https://kinocheck.com${page}`,
      title: item.title,
      summary: typeof item.title === 'string' ? item.title : '',
      publishedAt,
      videoUrl: youtube,
      videoMime: null,
    }, now, maxAgeHours, minScore);
    return draft ? [draft] : [];
  });
}

export function parseSource(source: PopSource, body: string, now = new Date(), maxAgeHours = 36, minScore = 45): DraftItem[] {
  if (source.kind === 'json-feed') return parseJsonFeed(source, body, now, maxAgeHours, minScore);
  if (source.kind === 'kinocheck') return parseKinoCheck(source, body, now, maxAgeHours, minScore);
  return parseRss(source, body, now, maxAgeHours, minScore);
}
