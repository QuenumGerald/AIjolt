import { finish } from './parse.js';
import { assessRelevance } from './relevance.js';
import { isPublicHttpsUrl, X_NATIVE_MAX_BYTES } from './video.js';
import type { DraftItem, PopSource } from './types.js';

export const PEERTUBE_HOSTS = ['koreus.tv', 'peertube.wtf'] as const;
type Row = Record<string, any>;
type FetchText = (url: string) => Promise<string>;
type VerifyVideo = (url: string) => Promise<void>;

function sameHost(raw: unknown, host: string): raw is string {
  if (typeof raw !== 'string' || !isPublicHttpsUrl(raw)) return false;
  return new URL(raw).hostname === host;
}

export function peerTubeFile(detail: Row, host: string): string | null {
  const files: Row[] = [...(Array.isArray(detail.files) ? detail.files : []),
    ...(Array.isArray(detail.streamingPlaylists) ? detail.streamingPlaylists.flatMap((p: Row) => Array.isArray(p.files) ? p.files : []) : [])];
  const valid = files.filter(f => sameHost(f.fileUrl, host) && /\.mp4(?:\?|$)/i.test(f.fileUrl)
    && Number(f.resolution?.id) > 0 && Number(f.resolution.id) <= 720
    && Number(f.size) > 0 && Number(f.size) <= X_NATIVE_MAX_BYTES);
  valid.sort((a,b) => Number(b.resolution.id) - Number(a.resolution.id));
  return valid[0]?.fileUrl ?? null;
}

function safeTitle(row: Row): string | null {
  if (typeof row.name !== 'string') return null;
  const title = row.name.split(/\r?\n/)[0].replace(/\s+/g,' ').trim();
  if (title.length < 12 || title.length > 180 || /^#/.test(title)) return null;
  if (/\b(?:nazi|zionists?|mosque|palestinians?|nato|nude|porn|nsfw|blood|gore|fight|gun|weapon|shooting|war|attack|death|suicide|accident|sex|politics|election|government|fouet|pétards|chalumeau|tir|taureaux)\b/i.test(title)) return null;
  const category = row.category?.label;
  const candidate = category === 'Music' && !assessRelevance(title, '').ok ? 'Music: ' + title : title;
  return assessRelevance(candidate, '').ok ? candidate : null;
}

/** Video-first discovery: fixed hosts only; no access-control bypass. */
export async function collectPeerTube(fetchText: FetchText, verify: VerifyVideo, now: Date,
  maxAgeHours: number, minScore: number): Promise<{items: DraftItem[]; failures: string[]}> {
  const items: DraftItem[] = [], failures: string[] = [];
  for (const host of PEERTUBE_HOSTS) {
    const source: PopSource = {id: 'peertube-' + host, publisher: host, url: 'https://' + host, kind: 'json-feed'};
    let rows: Row[];
    try {
      const data = JSON.parse(await fetchText('https://' + host + '/api/v1/videos?sort=-publishedAt&count=100&isLocal=true'));
      rows = Array.isArray(data.data) ? data.data : [];
    } catch (e) { failures.push(host + ': ' + String(e)); continue; }
    const creators = new Map<string, number>();
    let attempts = 0, accepted = 0;
    for (const row of rows) {
      if (attempts >= 18 || accepted >= 10) break;
      const duration = Number(row.duration), age = now.getTime() - Date.parse(row.publishedAt);
      if (row.nsfw !== false || row.isLocal !== true || row.privacy?.id !== 1 || !Number.isFinite(age)
        || age < -300000 || age > maxAgeHours * 3600000 || duration < .5 || duration > 140
        || typeof row.uuid !== 'string' || !/^[a-f0-9-]{36}$/i.test(row.uuid)) continue;
      const title = safeTitle(row);
      if (!title) continue;
      const creator = String(row.account?.id ?? row.channel?.id ?? row.uuid);
      if ((creators.get(creator) ?? 0) >= (host === 'koreus.tv' ? 8 : 2)) continue;
      attempts++;
      try {
        const detail = JSON.parse(await fetchText('https://' + host + '/api/v1/videos/' + row.uuid));
        if (detail.uuid !== row.uuid || detail.nsfw !== false || detail.isLive === true || detail.privacy?.id !== 1
          || Number(detail.duration) !== duration) continue;
        const file = peerTubeFile(detail, host);
        if (!file) continue;
        await verify(file);
        const url = 'https://' + host + '/videos/watch/' + row.uuid;
        const item = finish(source, {url, title, summary: '', publishedAt: row.publishedAt, videoUrl: file,
          videoMime: 'video/mp4', durationSeconds: duration}, now, maxAgeHours, minScore);
        if (item?.status !== 'ready') continue;
        items.push(item); accepted++;
        creators.set(creator, (creators.get(creator) ?? 0) + 1);
      } catch (e) { failures.push(host + ' video: ' + String(e).slice(0,180)); }
    }
  }
  return {items, failures};
}
