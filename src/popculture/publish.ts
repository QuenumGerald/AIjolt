import { reconcilePop } from './reconcile.js';
import { assessVideo } from './video.js';
import { verifyNativeUrl } from './native.js';
import { renderKliegMontage } from './montage.js';
import { formatPost } from './posts.js';
import { assessRelevance } from './relevance.js';
import { popConfig, publishGate } from './config.js';
import { lastPublishAt, listQueue, markAttempt, markFailed, markQueued, openPopDb, recentPublishCount } from './store.js';
import type { StoredItem } from './store.js';

export const createPopPostMutation = `mutation CreatePost($text: String!, $channelId: ChannelId!, $assets: [AssetInput!]!) { createPost(input: { text: $text, channelId: $channelId, schedulingType: automatic, mode: shareNow, needsApproval: false, assets: $assets }) { ... on PostActionSuccess { post { id status } } ... on MutationError { message } } }`;

export function popPostPayload(text: string, channelId: string, videoUrl: string | null) {
  if (!assessVideo({ url: videoUrl }).attach) throw new Error('native video file required');
  return {
    query: createPopPostMutation,
    variables: {
      text,
      channelId,
      assets: videoUrl ? [{ video: { url: videoUrl } }] : [],
    },
  };
}

export function formatQueueLine(item: StoredItem): string {
  const video = item.video.attach && item.video.url
    ? `video ${item.video.kind} ${item.video.url}`
    : `no video${item.video.rejection ? `: ${item.video.rejection}` : ''}`;
  return `#${item.id} ${item.status} ${item.publisher} ${item.score}\n${item.postText ?? item.title}\n${video}${item.rejection ? `\nrejected: ${item.rejection}` : ''}`;
}

export async function bufferCreate(token: string, body: object): Promise<{ id?: string; error?: string }> {
  const response = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 429) return { error: 'Buffer rate limited' };
  if (!response.ok) return { error: `Buffer HTTP ${response.status}` };
  const payload = await response.json() as { errors?: Array<{ message?: string }>; data?: { createPost?: { post?: { id?: string }; message?: string } } };
  const error = payload.errors?.map(item => item.message).filter(Boolean).join('; ') || payload.data?.createPost?.message;
  const id = payload.data?.createPost?.post?.id;
  if (error || !id) return { error: error || 'Buffer returned no post id' };
  return { id };
}

/** A configured zero disables the application-level 24-hour publication cap. */
export function isDailyCapReached(recent: number, maxPer24h: number): boolean {
  return maxPer24h > 0 && recent >= maxPer24h;
}

export function canPublishNow(db: ReturnType<typeof openPopDb>, now = new Date()): { ok: true } | { ok: false; reason: string } {
  const config = popConfig();
  if (isDailyCapReached(recentPublishCount(db), config.maxPostsPerDay)) return { ok: false, reason: 'daily cap reached' };
  const last = lastPublishAt(db);
  if (last && now.getTime() - new Date(last).getTime() < config.postSpacingMinutes * 60_000) {
    return { ok: false, reason: `wait ${config.postSpacingMinutes} minutes between posts` };
  }
  return { ok: true };
}

export async function publishPop(forceDryRun = false): Promise<string[]> {
  const config = popConfig();
  const db = openPopDb(config.databasePath);
  const logs: string[] = [];
  if (!forceDryRun && !config.dryRun) logs.push(...await reconcilePop(db, config));
  const gate = forceDryRun || config.dryRun || !config.publishEnabled ? { ok: false as const, reason: forceDryRun ? 'forced dry-run' : config.dryRun ? 'POPCULTURE_DRY_RUN is true' : 'POPCULTURE_PUBLISH_ENABLED is not true' } : publishGate();
  const ready = listQueue(db, 'ready', 50);
  if (!ready.length) {
    logs.push('no ready posts');
    db.close();
    return logs;
  }
  let sent = 0;
  for (const item of ready) {
    // Revalidate legacy queued content against the current editorial policy.
    // An old score/category must never bypass the entertainment-only gate.
    const relevance = assessRelevance(item.title, item.summary);
    if (!relevance.ok) {
      if (!forceDryRun && !config.dryRun) {
        db.prepare("UPDATE pop_items SET status='rejected', rejection=? WHERE id=? AND status='ready'")
          .run(`editorial: ${relevance.reason}`, item.id);
      }
      logs.push(`skipped #${item.id}: ${relevance.reason}`);
      continue;
    }
    // Reformat at send-time so pre-existing ready rows are guaranteed to use
    // the same category-specific #Klieg tags as newly collected stories.
    const text = formatPost(item.title, relevance.category, item.summary);
    if (!text) {
      db.prepare("UPDATE pop_items SET status='rejected', rejection=? WHERE id=? AND status='ready'")
        .run('title leaves no space for #Klieg', item.id);
      logs.push(`skipped #${item.id}: no space for hashtags without truncation`);
      continue;
    }
    // Recheck legacy rows even if their old video_attach flag is still set.
    const video = assessVideo(item.video);
    if (!video.attach || !video.url) {
      db.prepare("UPDATE pop_items SET status='rejected', rejection=? WHERE id=? AND status='ready'").run(video.rejection, item.id);
      logs.push(`skipped #${item.id}: ${video.rejection}`);
      continue;
    }
    if (!forceDryRun && config.publishEnabled && !config.dryRun) {
      const pace = canPublishNow(db);
      if (!pace.ok) { logs.push(pace.reason); break; }
    }
    if (sent >= config.maxPerCycle) break;
    // Never render or upload a video during doctor/dry-run mode.
    logs.push(formatQueueLine(item));
    if (!gate.ok) continue;
    let videoUrl = video.url;
    if (config.montageEnabled) {
      try {
        const montage = await renderKliegMontage(video, item.title, config);
        if (!montage.attach || !montage.url) throw new Error('edited file is not publishable');
        videoUrl = montage.url;
        logs.push(`montage ready for #${item.id}: ${montage.durationSeconds}s`);
      } catch (error) {
        logs.push(`skipped #${item.id}: montage failed (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`);
        continue; // No unedited fallback when the user selected automatic editing.
      }
    }
    try { await verifyNativeUrl(videoUrl); } catch (error) {
      logs.push(`skipped #${item.id}: video unavailable (${error instanceof Error ? error.message : String(error)})`);
      continue;
    }
    markAttempt(db, item.id, text, videoUrl);
    const result = await bufferCreate(gate.token, popPostPayload(text, gate.channelId, videoUrl));
    if (result.id) {
      markQueued(db, item.id, result.id);
      logs.push(`queued Buffer ${result.id}`);
    } else {
      markFailed(db, item.id, result.error ?? 'unknown Buffer error', /rate limited|HTTP 5/i.test(result.error ?? '') === false);
      logs.push(`Buffer error: ${result.error}`);
    }
    sent += 1;
  }
  db.close();
  return logs;
}

export function showQueue(status: Parameters<typeof listQueue>[1] = 'ready', limit = 20): string[] {
  const db = openPopDb();
  const lines = listQueue(db, status, limit).map(formatQueueLine);
  db.close();
  return lines.length ? lines : ['queue empty'];
}
