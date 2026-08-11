import { config } from './config.js'; import { db, rowToJob } from './db.js'; import { generatePost } from './posts.js'; import { logger } from './logger.js'; import { bufferCreatePostPayload, bufferGetPostPayload, classifyBufferPostResponse } from './buffer.js';
type Network = 'x'|'linkedin';
const BUFFER_API = 'https://api.buffer.com';
let lastBufferSyncAt = 0;

export async function bufferRequest(body: object): Promise<unknown> {
  if (!config.buffer.token) throw new Error('BUFFER_ACCESS_TOKEN is missing');
  const response = await fetch(BUFFER_API, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${config.buffer.token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Buffer API ${response.status} ${response.statusText}`);
  return response.json();
}

export async function syncBufferPublications(force = false): Promise<{ published: number; queued: number; failed: number }> {
  const now = Date.now();
  const minIntervalMs = config.bufferSyncMinIntervalMinutes * 60_000;
  if (!force && lastBufferSyncAt && now - lastBufferSyncAt < minIntervalMs) {
    logger.info(`Buffer sync skipped: last sync was less than ${config.bufferSyncMinIntervalMinutes} minutes ago`);
    return { published: 0, queued: jobQueuedCount('x') + jobQueuedCount('linkedin') + newsQueuedCount('x'), failed: 0 };
  }
  lastBufferSyncAt = now;
  const rows = db.prepare(`SELECT kind,id,provider_id FROM (SELECT 'jobs' kind,id,provider_id,created_at FROM publications WHERE status='queued' AND provider_id IS NOT NULL UNION ALL SELECT 'news' kind,id,provider_id,created_at FROM news_publications WHERE status='queued' AND provider_id IS NOT NULL) ORDER BY created_at ASC LIMIT ?`).all(config.bufferSyncMaxPosts) as Array<{ kind: 'jobs' | 'news'; id: number; provider_id: string }>;
  const summary = { published: 0, queued: 0, failed: 0 };
  for (const row of rows) {
    const table = row.kind === 'jobs' ? 'publications' : 'news_publications';
    const updatePublished = db.prepare(`UPDATE ${table} SET status='published',error=NULL WHERE id=? AND status='queued'`);
    const updateMissing = db.prepare(`UPDATE ${table} SET status='published',error=? WHERE id=? AND status='queued'`);
    const updateFailed = db.prepare(`UPDATE ${table} SET status='failed',error=? WHERE id=? AND status='queued'`);
    try {
      const state = classifyBufferPostResponse(await bufferRequest(bufferGetPostPayload(row.provider_id)));
      if (state.kind === 'published') { updatePublished.run(row.id); summary.published++; }
      else if (state.kind === 'queued') summary.queued++;
      else if (state.kind === 'missing') { updateMissing.run(`Buffer history unavailable: ${state.message}`, row.id); summary.published++; }
      else { updateFailed.run(state.message, row.id); summary.failed++; }
    } catch (error) {
      logger.warn(`Buffer sync deferred for ${row.provider_id}: ${error instanceof Error ? error.message : String(error)}`);
      summary.queued++;
    }
  }
  if (rows.length) logger.info(`Buffer sync: ${summary.published} published, ${summary.queued} queued, ${summary.failed} failed (${rows.length}/${config.bufferSyncMaxPosts} checked)`);
  return summary;
}

export async function createBufferPost(text: string, channelId: string): Promise<{ id: string; dueAt?: string }> {
  const payload = await bufferRequest(bufferCreatePostPayload(text, channelId)) as { errors?: Array<{ message?: string }>; data?: { createPost?: { post?: { id: string; dueAt?: string }; message?: string } } };
  const error = payload.errors?.map(item => item.message).filter(Boolean).join('; ') || payload.data?.createPost?.message;
  const post = payload.data?.createPost?.post;
  if (error || !post?.id) throw new Error(error || 'Buffer API returned no post ID');
  return post;
}
export function jobQueuedCount(network: Network): number {
  const row = db.prepare(`SELECT count(*) n FROM publications WHERE network=? AND status='queued'`).get(network) as { n: number };
  return row.n;
}

export function newsQueuedCount(network: Network): number {
  const row = db.prepare(`SELECT count(*) n FROM news_publications WHERE network=? AND status='queued'`).get(network) as { n: number };
  return row.n;
}
export async function publish(dryRunFlag = false) {
  if (!dryRunFlag && !config.dryRun) await syncBufferPublications();
  const dry = dryRunFlag || config.dryRun; const rows = db.prepare(`SELECT * FROM jobs j WHERE status='active' AND NOT EXISTS (SELECT 1 FROM publications p WHERE p.job_id=j.id AND p.status IN ('published','queued')) ORDER BY score DESC LIMIT 20`).all() as any[]; const emitted: Record<Network, number> = { x: 0, linkedin: 0 };
  const dailyCount = Object.fromEntries((['x','linkedin'] as Network[]).map(network => [network, (db.prepare(`SELECT count(*) n FROM publications WHERE network=? AND status IN ('published','queued') AND created_at >= datetime('now','start of day')`).get(network) as any).n])) as Record<Network, number>;
  const queuedCount = Object.fromEntries((['x','linkedin'] as Network[]).map(network => [network, jobQueuedCount(network)])) as Record<Network, number>;
  for (const row of rows) for (const network of ['x','linkedin'] as Network[]) {
    const max = config.daily[network]; const usableQueue = Math.max(0, config.queueCapacity - config.reserve); if (dailyCount[network] + emitted[network] >= max || queuedCount[network] + emitted[network] >= usableQueue) continue;
    const job = rowToJob(row), text = await generatePost(job, network); emitted[network]++;
    if (dry) { logger.info(`[DRY RUN] ${network}:\n${text}`); continue; }
    const channelId = config.buffer[network]; if (!channelId) { logger.error(`Skipping ${network}: BUFFER_${network === 'x' ? 'X' : 'LINKEDIN'}_CHANNEL_ID is missing`); continue; }
    try { const post = await createBufferPost(text, channelId); db.prepare(`INSERT INTO publications(job_id,network,status,text,provider_id,created_at) VALUES(?,?,'queued',?,?,?) ON CONFLICT(job_id,network) DO UPDATE SET status='queued',text=excluded.text,provider_id=excluded.provider_id,error=NULL,created_at=excluded.created_at`).run(row.id, network, text, post.id, new Date().toISOString()); logger.info(`Buffer scheduled ${network} job ${row.id} as ${post.id}${post.dueAt ? ` for ${post.dueAt}` : ''}`); } catch (error) { const message = error instanceof Error ? error.message : String(error); db.prepare(`INSERT INTO publications(job_id,network,status,text,error,created_at) VALUES(?,?,'failed',?,?,?) ON CONFLICT(job_id,network) DO UPDATE SET status='failed',error=excluded.error,created_at=excluded.created_at`).run(row.id, network, text, message, new Date().toISOString()); logger.error(`Buffer failed ${network} job ${row.id}: ${message}`); }
  }
}
