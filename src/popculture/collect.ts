import { popConfig } from './config.js';
import { parseSource } from './parse.js';
import { POP_SOURCES } from './sources.js';
import { logRun, openPopDb, upsertItem } from './store.js';
import { assessVideo, isPublicHttpsUrl, jwMediaId, pickJwMp4 } from './video.js';
import type { DraftItem, PopSource } from './types.js';

const UA = 'PopCultureBot/0.1 (research collector; +https://github.com/QuenumGerald/AIjolt)';

async function fetchText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!isPublicHttpsUrl(url)) throw new Error(`blocked URL ${url}`);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
    headers: { 'user-agent': UA, accept: 'application/rss+xml, application/json, application/feed+json, text/xml, */*;q=0.4' },
  });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) throw new Error(`${parsed.hostname} redirected without location`);
    const next = new URL(location, url);
    const sameHost = parsed.hostname.replace(/^www\./, '') === next.hostname.replace(/^www\./, '');
    if (!sameHost) throw new Error(`refusing cross-host redirect to ${next.hostname}`);
    return fetchText(next.href);
  }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 2_000_000) throw new Error('response larger than 2 MB');
  return response.text();
}

async function resolveJw(item: DraftItem): Promise<DraftItem> {
  const raw = item.video.url;
  if (!raw) return item;
  const id = jwMediaId(raw);
  if (!id) return item;
  try {
    const payload = JSON.parse(await fetchText(`https://cdn.jwplayer.com/v2/media/${id}`)) as {
      playlist?: Array<{ duration?: number; sources?: Array<{ type?: string; file?: string; width?: number; filesize?: number }> }>;
    };
    const entry = payload.playlist?.[0];
    const mp4 = pickJwMp4(entry?.sources ?? []);
    if (!mp4) return item;
    return {
      ...item,
      video: assessVideo({
        url: mp4.url,
        mime: mp4.mime,
        bytes: mp4.bytes,
        durationSeconds: item.video.durationSeconds ?? entry?.duration ?? null,
        rights: item.video.rights,
        stable: false,
      }),
    };
  } catch {
    return item;
  }
}

export async function collectPop(now = new Date()): Promise<{ collected: number; ready: number; withVideo: number; failures: string[] }> {
  const config = popConfig();
  const db = openPopDb(config.databasePath);
  const failures: string[] = [];
  const drafts: DraftItem[] = [];
  const results = await Promise.allSettled(POP_SOURCES.map(async (source: PopSource) => {
    const body = await fetchText(source.url);
    try {
      return parseSource(source, body, now, config.maxAgeHours, config.minScore);
    } catch (error) {
      throw new Error(`parse failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));
  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      failures.push(`${POP_SOURCES[index].id}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      continue;
    }
    drafts.push(...result.value);
  }
  let collected = 0;
  let ready = 0;
  let withVideo = 0;
  for (const draft of drafts) {
    const item = draft.video.kind === 'hls-playlist' ? await resolveJw(draft) : draft;
    upsertItem(db, item);
    collected += 1;
    if (item.status === 'ready') ready += 1;
    if (item.video.attach) withVideo += 1;
  }
  logRun(db, 'collect', failures.length && !collected ? 'failed' : 'ok', JSON.stringify({ collected, ready, withVideo, failures }));
  db.close();
  return { collected, ready, withVideo, failures };
}
