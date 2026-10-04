import { config } from './config.js';
import { db, rowToJob } from './db.js';
import { generatePost } from './posts.js';
import { logger } from './logger.js';
import { bufferCreatePostPayload, bufferDeletePostPayload, bufferGetPostPayload, classifyBufferPostResponse } from './buffer.js';
import { jobSlotsToday, newsToEvictForJobs } from './queue-slots.js';

type Network = 'x' | 'linkedin';
const BUFFER_API = 'https://api.buffer.com';
let lastBufferSyncAt = 0;
let bufferBlockedUntil = 0;

export class BufferRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Buffer rate limited; retry after ${retryAfterSeconds}s`);
    this.name = 'BufferRateLimitError';
  }
}

function ensureBufferAvailable(): void {
  const remainingMs = bufferBlockedUntil - Date.now();
  if (remainingMs > 0) throw new BufferRateLimitError(Math.ceil(remainingMs / 1000));
}

export async function bufferRequest(body: object): Promise<unknown> {
  if (!config.buffer.token) throw new Error('BUFFER_ACCESS_TOKEN is missing');
  ensureBufferAvailable();
  const response = await fetch(BUFFER_API, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${config.buffer.token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  if (response.status === 429) {
    const retryAfterSeconds = Math.max(60, Number.parseInt(response.headers.get('retry-after') || '900', 10) || 900);
    bufferBlockedUntil = Date.now() + retryAfterSeconds * 1000;
    throw new BufferRateLimitError(retryAfterSeconds);
  }
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
      if (error instanceof BufferRateLimitError) {
        logger.warn(`${error.message}; stopping Buffer sync`);
        summary.queued++;
        break;
      }
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

export async function deleteBufferPost(id: string): Promise<void> {
  const payload = await bufferRequest(bufferDeletePostPayload(id)) as {
    errors?: Array<{ message?: string }>;
    data?: { deletePost?: { id?: string; message?: string } | null };
  };
  const error = payload.errors?.map(item => item.message).filter(Boolean).join('; ') || payload.data?.deletePost?.message;
  if (error && !/post not found/i.test(error)) throw new Error(error);
}

export function jobQueuedCount(network: Network): number {
  const row = db.prepare(`SELECT count(*) n FROM publications WHERE network=? AND status='queued'`).get(network) as { n: number };
  return row.n;
}

export function newsQueuedCount(network: Network): number {
  const row = db.prepare(`SELECT count(*) n FROM news_publications WHERE network=? AND status='queued'`).get(network) as { n: number };
  return row.n;
}

export function dailyJobCount(network: Network): number {
  return (db.prepare(`SELECT count(*) n FROM publications WHERE network=? AND status IN ('published','queued') AND created_at >= datetime('now','start of day')`).get(network) as { n: number }).n;
}

export function dailyNewsCount(): number {
  return (db.prepare(`SELECT count(*) n FROM news_publications WHERE network='x' AND status IN ('published','queued') AND created_at >= datetime('now','start of day')`).get() as { n: number }).n;
}

function markEvicted(table: 'publications' | 'news_publications', id: number, reason: string): void {
  db.prepare(`UPDATE ${table} SET status='failed',error=? WHERE id=? AND status='queued'`).run(reason, id);
}

async function dropQueuedRow(table: 'publications' | 'news_publications', id: number, providerId: string | null, reason: string): Promise<void> {
  if (providerId) {
    try { await deleteBufferPost(providerId); }
    catch (error) {
      if (error instanceof BufferRateLimitError) throw error;
      logger.warn(`Buffer delete deferred for ${providerId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  markEvicted(table, id, reason);
}

export function unpublishedJobCount(network: Network): number {
  return (db.prepare(`SELECT count(*) n FROM jobs j WHERE status='active' AND NOT EXISTS (SELECT 1 FROM publications p WHERE p.job_id=j.id AND p.network=? AND p.status IN ('published','queued'))`).get(network) as { n: number }).n;
}

export async function makeRoomForJobPosts(jobsWanted: number): Promise<number> {
  if (config.queueCapacity <= 0) return 0;
  let evicted = 0;
  const reason = 'evicted: free Buffer slot for a job announcement';
  while (evicted < 50) {
    const needed = newsToEvictForJobs({
      capacity: config.queueCapacity,
      reserve: config.reserve,
      jobQueued: jobQueuedCount('x'),
      newsQueued: newsQueuedCount('x'),
      jobsWanted,
    });
    if (!needed) break;
    const row = db.prepare(`SELECT id, provider_id AS providerId FROM news_publications WHERE network='x' AND status='queued' ORDER BY created_at ASC LIMIT 1`).get() as { id: number; providerId: string | null } | undefined;
    if (!row) break;
    await dropQueuedRow('news_publications', row.id, row.providerId, reason);
    evicted++;
  }
  while (evicted < 50) {
    const slots = jobSlotsToday({
      capacity: config.queueCapacity,
      reserve: config.reserve,
      jobQueued: jobQueuedCount('x'),
      newsQueued: newsQueuedCount('x'),
      jobsToday: dailyJobCount('x'),
      maxJobsPerDay: config.daily.x,
    });
    if (slots > 0) break;
    const cutoff = `-${config.staleQueueHours} hours`;
    const staleNews = db.prepare(`SELECT id, provider_id AS providerId, created_at AS createdAt FROM news_publications WHERE network='x' AND status='queued' AND created_at < datetime('now', ?) ORDER BY created_at ASC LIMIT 1`).get(cutoff) as { id: number; providerId: string | null; createdAt: string } | undefined;
    const staleJob = db.prepare(`SELECT id, provider_id AS providerId, created_at AS createdAt FROM publications WHERE network='x' AND status='queued' AND created_at < datetime('now', ?) ORDER BY created_at ASC LIMIT 1`).get(cutoff) as { id: number; providerId: string | null; createdAt: string } | undefined;
    const pickNews = staleNews && (!staleJob || staleNews.createdAt <= staleJob.createdAt);
    const row = pickNews ? staleNews : staleJob;
    if (!row) break;
    await dropQueuedRow(pickNews ? 'news_publications' : 'publications', row.id, row.providerId, `evicted: queued longer than ${config.staleQueueHours}h`);
    evicted++;
  }
  if (evicted) logger.info(`Freed ${evicted} Buffer X slots for job announcements`);
  return evicted;
}

export async function publish(dryRunFlag = false) {
  const dry = dryRunFlag || config.dryRun;
  if (!dry) await syncBufferPublications(true);
  const rows = db.prepare(`SELECT * FROM jobs j WHERE status='active' AND NOT EXISTS (SELECT 1 FROM publications p WHERE p.job_id=j.id AND p.status IN ('published','queued')) ORDER BY score DESC LIMIT ?`).all(Math.max(config.jobsPerCycle * 2, 10)) as any[];
  const emitted: Record<Network, number> = { x: 0, linkedin: 0 };
  const dailyCount = Object.fromEntries((['x', 'linkedin'] as Network[]).map(network => [network, dailyJobCount(network)])) as Record<Network, number>;
  if (!dry) {
    const jobsWanted = Math.max(0, config.daily.x - dailyCount.x);
    await makeRoomForJobPosts(jobsWanted);
  }
  for (const row of rows) for (const network of ['x', 'linkedin'] as Network[]) {
    const slots = network === 'x'
      ? jobSlotsToday({
        capacity: config.queueCapacity,
        reserve: config.reserve,
        jobQueued: jobQueuedCount('x'),
        newsQueued: newsQueuedCount('x'),
        jobsToday: dailyCount.x + emitted.x,
        newsToday: dailyNewsCount(),
        maxJobsPerDay: config.daily.x,
        maxXPostsPerDay: config.daily.xTotal,
        maxPerCycle: config.jobsPerCycle,
        emittedThisCycle: emitted.x,
      })
      : jobSlotsToday({
        capacity: config.queueCapacity,
        reserve: config.reserve,
        jobQueued: jobQueuedCount('linkedin'),
        newsQueued: 0,
        jobsToday: dailyCount.linkedin + emitted.linkedin,
        maxJobsPerDay: config.daily.linkedin,
        maxPerCycle: config.jobsPerCycle,
        emittedThisCycle: emitted.linkedin,
      });
    if (!slots) continue;
    const job = rowToJob(row);
    const text = await generatePost(job, network);
    emitted[network]++;
    if (dry) { logger.info(`[DRY RUN] ${network}:\n${text}`); continue; }
    const channelId = config.buffer[network];
    if (!channelId) { logger.error(`Skipping ${network}: BUFFER_${network === 'x' ? 'X' : 'LINKEDIN'}_CHANNEL_ID is missing`); continue; }
    try {
      let post;
      try {
        post = await createBufferPost(text, channelId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (network !== 'x' || !/scheduled posts limit reached/i.test(message)) throw error;
        logger.warn('Buffer scheduled-post cap hit; evicting news to queue a job');
        await makeRoomForJobPosts(1);
        post = await createBufferPost(text, channelId);
      }
      db.prepare(`INSERT INTO publications(job_id,network,status,text,provider_id,created_at) VALUES(?,?,'queued',?,?,?) ON CONFLICT(job_id,network) DO UPDATE SET status='queued',text=excluded.text,provider_id=excluded.provider_id,error=NULL,created_at=excluded.created_at`).run(row.id, network, text, post.id, new Date().toISOString());
      logger.info(`Buffer scheduled ${network} job ${row.id} as ${post.id}${post.dueAt ? ` for ${post.dueAt}` : ''}`);
    } catch (error) {
      if (error instanceof BufferRateLimitError) {
        logger.warn(`${error.message}; stopping job publication cycle without marking additional posts failed`);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      db.prepare(`INSERT INTO publications(job_id,network,status,text,error,created_at) VALUES(?,?,'failed',?,?,?) ON CONFLICT(job_id,network) DO UPDATE SET status='failed',error=excluded.error,created_at=excluded.created_at`).run(row.id, network, text, message, new Date().toISOString());
      logger.error(`Buffer failed ${network} job ${row.id}: ${message}`);
    }
  }
}
