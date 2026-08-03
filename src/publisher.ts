import { config } from './config.js'; import { db, rowToJob } from './db.js'; import { generatePost } from './posts.js'; import { logger } from './logger.js'; import { bufferCreatePostPayload } from './buffer.js';
type Network = 'x'|'linkedin';
const BUFFER_API = 'https://api.buffer.com';
export async function createBufferPost(text: string, channelId: string): Promise<{ id: string; dueAt?: string }> {
  if (!config.buffer.token) throw new Error('BUFFER_ACCESS_TOKEN is missing');
  const response = await fetch(BUFFER_API, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${config.buffer.token}` }, body: JSON.stringify(bufferCreatePostPayload(text, channelId)), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Buffer API ${response.status} ${response.statusText}`);
  const payload = await response.json() as { errors?: Array<{ message?: string }>; data?: { createPost?: { post?: { id: string; dueAt?: string }; message?: string } } };
  const error = payload.errors?.map(item => item.message).filter(Boolean).join('; ') || payload.data?.createPost?.message;
  const post = payload.data?.createPost?.post;
  if (error || !post?.id) throw new Error(error || 'Buffer API returned no post ID');
  return post;
}
export async function publish(dryRunFlag = false) {
  const dry = dryRunFlag || config.dryRun; const rows = db.prepare(`SELECT * FROM jobs j WHERE status='active' AND NOT EXISTS (SELECT 1 FROM publications p WHERE p.job_id=j.id AND p.status IN ('published','queued')) ORDER BY score DESC LIMIT 20`).all() as any[]; const emitted: Record<Network, number> = { x: 0, linkedin: 0 };
  const dailyCount = Object.fromEntries((['x','linkedin'] as Network[]).map(network => [network, (db.prepare(`SELECT count(*) n FROM publications WHERE network=? AND status IN ('published','queued') AND created_at >= datetime('now','start of day')`).get(network) as any).n])) as Record<Network, number>;
  const queuedCount = Object.fromEntries((['x','linkedin'] as Network[]).map(network => [network, (db.prepare(`SELECT count(*) n FROM publications WHERE network=? AND status='queued'`).get(network) as any).n])) as Record<Network, number>;
  for (const row of rows) for (const network of ['x','linkedin'] as Network[]) {
    const max = config.daily[network]; const usableQueue = Math.max(0, config.queueCapacity - config.reserve); if (dailyCount[network] + emitted[network] >= max || queuedCount[network] + emitted[network] >= usableQueue) continue;
    const job = rowToJob(row), text = await generatePost(job, network); emitted[network]++;
    if (dry) { logger.info(`[DRY RUN] ${network}:\n${text}`); continue; }
    const channelId = config.buffer[network]; if (!channelId) { logger.error(`Skipping ${network}: BUFFER_${network === 'x' ? 'X' : 'LINKEDIN'}_CHANNEL_ID is missing`); continue; }
    try { const post = await createBufferPost(text, channelId); db.prepare(`INSERT INTO publications(job_id,network,status,text,provider_id,created_at) VALUES(?,?,'queued',?,?,?) ON CONFLICT(job_id,network) DO UPDATE SET status='queued',text=excluded.text,provider_id=excluded.provider_id,error=NULL,created_at=excluded.created_at`).run(row.id, network, text, post.id, new Date().toISOString()); logger.info(`Buffer scheduled ${network} job ${row.id} as ${post.id}${post.dueAt ? ` for ${post.dueAt}` : ''}`); } catch (error) { const message = error instanceof Error ? error.message : String(error); db.prepare(`INSERT INTO publications(job_id,network,status,text,error,created_at) VALUES(?,?,'failed',?,?,?) ON CONFLICT(job_id,network) DO UPDATE SET status='failed',error=excluded.error,created_at=excluded.created_at`).run(row.id, network, text, message, new Date().toISOString()); logger.error(`Buffer failed ${network} job ${row.id}: ${message}`); }
  }
}
