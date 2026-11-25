import { recordPlayer, recordingAllowed } from './browser-record.js';
import { chromium } from 'playwright-core';
import pLimit from 'p-limit';
import { reconcilePop } from './reconcile.js';
import { extractArticleVideo } from './article.js';
import { materializeDirectExcerpt, needsDirectExcerpt, verifyNativeUrl } from './native.js';
import { popConfig } from './config.js';
import { parseSource } from './parse.js';
import { parseVideoPage } from './video-sources.js';
import { collectPeerTube } from './peertube.js';
import { POP_SOURCES } from './sources.js';
import { logRun, openPopDb, rowToItem, upsertItem } from './store.js';
import { assessVideo, isPublicHttpsUrl, jwMediaId, pickJwMp4 } from './video.js';
import type { DraftItem, PopSource } from './types.js';

const UA = 'PopCultureBot/0.1 (research collector; +https://github.com/QuenumGerald/AIjolt)';

async function fetchText(url: string, redirects = 0): Promise<string> {
  if (redirects > 5) throw new Error("too many redirects");
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
    return fetchText(next.href, redirects + 1);
  }
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > 5_000_000) throw new Error('response larger than 5 MB');
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
  failures.push(...await reconcilePop(db, config));
  const drafts: DraftItem[] = [];
  const limit = pLimit(6);
  const results = await Promise.allSettled(POP_SOURCES.map((source: PopSource) => limit(async () => {
    const body = await fetchText(source.url);
    try {
      return parseSource(source, body, now, config.maxAgeHours, config.minScore);
    } catch (error) {
      throw new Error(`parse failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })));
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
  // Dedicated video feeds often put the actual player only on the article page.
  const pageLimit = pLimit(4);
  const pageCandidates = drafts.filter(item => item.video.kind === 'none' && item.postText && item.rejection === item.video.rejection).filter(item => !db.prepare("SELECT 1 FROM pop_items WHERE url=? AND status IN ('published','ready')").get(item.url)).slice(0, 80);
  await Promise.all(pageCandidates.map(item => pageLimit(async () => {
    try {
      const html = await fetchText(item.url);
      if (item.source === 'euronews-culture-video') {
        const videos = parseVideoPage({
          id: item.source, publisher: item.publisher, url: item.url,
          kind: 'euronews-video', defaultCategory: item.category,
        }, html, now, config.maxAgeHours, config.minScore);
        const matched = videos.find(candidate => candidate.url === item.url && candidate.video.kind === 'direct-file');
        if (matched) {
          item.video = matched.video;
          // Use the same native-file and editorial checks as other sources.
          item.rejection = matched.video.rejection;
        }
      } else {
        const video = extractArticleVideo(html);
        if (video) { item.video = video; item.rejection = video.rejection; }
      }
    } catch (error) { failures.push(`${item.source} article: ${error instanceof Error ? error.message : String(error)}`); }
  })));
  // Browser fallback: inspect publisher-declared video metadata on rendered article pages.
  const browserCandidates = pageCandidates.filter(item => !item.video.attach && item.video.kind !== 'youtube-page').sort((a,b)=>Number(recordingAllowed(b.url))-Number(recordingAllowed(a.url))).slice(0, 12);
  let recordings = 0;
  if (browserCandidates.length) {
    try {
      const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome', headless:true, args:['--no-sandbox','--disable-dev-shm-usage']});
      try {
        const context = await browser.newContext({serviceWorkers:'block'});
        await context.route('**/*', route => isPublicHttpsUrl(route.request().url()) ? route.continue() : route.abort());
        for (const item of browserCandidates) {
          const page = await context.newPage();
          try {
            const response = await page.goto(item.url, {waitUntil:'domcontentloaded',timeout:10000});
            if (!response?.ok()) continue;
            await page.waitForTimeout(1000);
            const video = extractArticleVideo(await page.content());
            if (video?.attach && video.url) {
              await verifyNativeUrl(video.url);
              item.video = video; item.rejection = video.rejection;
            }
            if (!item.video.attach && recordings < 3 && recordingAllowed(item.url)) {
              recordings++;
              const recorded = await recordPlayer(page,item.url,config);
              if(recorded) { item.video=recorded; item.rejection=recorded.rejection; }
            }
          } catch (error) { failures.push(`${item.source} browser: ${String(error).slice(0,160)}`); }
          finally { await page.close(); }
        }
      } finally { await browser.close(); }
    } catch (error) { failures.push(`browser: ${String(error).slice(0,160)}`); }
  }
  let directClipAttempts = 0;
  // Prefer actual native video sources over text-only articles and embedded players.
  // Preserve editorial quality as the secondary sort key.
  drafts.sort((a, b) => {
    const videoPriority = (item: DraftItem): number => item.video.kind === 'direct-file' ? 3
      : item.video.kind === 'hls-playlist' ? 1 : 0;
    return videoPriority(b) - videoPriority(a) || b.score - a.score;
  });
  for (const draft of drafts) {
    const eligible = draft.postText && draft.score >= config.minScore && (draft.status === 'ready' || draft.rejection === draft.video.rejection);
    let item = draft.video.kind === 'hls-playlist' ? await resolveJw(draft) : draft;
    const stored = db.prepare('SELECT * FROM pop_items WHERE url=?').get(item.url) as Record<string, unknown> | undefined;
    if (stored && ['ready', 'rejected'].includes(String(stored.status))) {
      const existing = rowToItem(stored);
      if (existing.video.attach && existing.video.kind === 'direct-file') item = { ...item, video: existing.video };
    }
    // Legacy rows could be marked attach=true although duration exceeds the X limit.
    // Reassess the actual metadata before continuing or trusting the cached value.
    if (item.video.attach) {
      const checked = assessVideo({
        url: item.video.url, mime: item.video.mime,
        bytes: item.video.bytes, durationSeconds: item.video.durationSeconds,
      });
      if (!checked.attach) item = { ...item, video: checked };
    }
    // Repurpose overlong native MP4s as short H.264/AAC excerpts, not raw >140s assets.
    // Stay inside an explicit per-collection budget; dedupe across cycles by URL and attempts.
    if (eligible && config.mediaBaseUrl && directClipAttempts < config.maxDirectClipsPerCycle
        && needsDirectExcerpt(item.video)
        && (!stored || ['ready', 'rejected'].includes(String(stored.status)))) {
      const previous = db.prepare('SELECT attempted_at FROM pop_video_attempts WHERE url=?').get(item.url) as { attempted_at: string } | undefined;
      if (!previous || now.getTime() - new Date(previous.attempted_at).getTime() >= 2 * 3_600_000) {
        directClipAttempts++;
        db.prepare('INSERT INTO pop_video_attempts(url,attempted_at) VALUES(?,?) ON CONFLICT(url) DO UPDATE SET attempted_at=excluded.attempted_at').run(item.url, now.toISOString());
        try { item = { ...item, video: await materializeDirectExcerpt(item.video, config) }; }
        catch (error) { failures.push(`${item.source} excerpt: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`); }
      }
    }
    if (eligible) item = { ...item, status: item.video.attach ? 'ready' : 'rejected', rejection: item.video.attach ? null : item.video.rejection };
    // Never persist a ready video that cannot actually be attached.
    if (item.status === 'ready' && !item.video.attach) {
      item = { ...item, status: 'rejected', rejection: item.video.rejection || 'native video missing or invalid' };
    }
    upsertItem(db, item);
    collected += 1;
    if (item.status === 'ready') ready += 1;
    if (item.video.attach) withVideo += 1;
  }
  const peer = await collectPeerTube(fetchText, verifyNativeUrl, now, config.maxAgeHours, config.minScore, url => Boolean(db.prepare("SELECT 1 FROM pop_items WHERE url=? AND status IN ('published','ready')").get(url)));
  failures.push(...peer.failures);
  for (const item of peer.items) { upsertItem(db, item); collected++; }
  // Report actual queue size, not feed-level eligible rows that are already published.
  ready = (db.prepare("SELECT COUNT(*) AS n FROM pop_items WHERE status='ready'").get() as {n:number}).n;
  withVideo = (db.prepare("SELECT COUNT(*) AS n FROM pop_items WHERE status='ready' AND video_attach=1").get() as {n:number}).n;
  logRun(db, 'collect', failures.length && !collected ? 'failed' : 'ok', JSON.stringify({ collected, ready, withVideo, failures }));
  db.close();
  return { collected, ready, withVideo, failures };
}
