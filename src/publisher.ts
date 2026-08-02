import { appendFile, mkdir } from 'node:fs/promises'; import { dirname } from 'node:path';
import { config } from './config.js'; import { db, rowToJob } from './db.js'; import { linkedinPost, xPost } from './posts.js'; import { logger } from './logger.js';
type Network = 'x'|'linkedin';
export async function publish(dryRunFlag = false) {
  const dry = dryRunFlag || config.dryRun;
  const rows = db.prepare(`SELECT * FROM jobs j WHERE status='active' AND NOT EXISTS (SELECT 1 FROM publications p WHERE p.job_id=j.id AND p.status IN ('published','queued')) ORDER BY score DESC LIMIT 20`).all() as any[];
  const emitted: Record<Network, number> = { x: 0, linkedin: 0 };
  for (const row of rows) for (const network of ['x','linkedin'] as Network[]) {
    const max = config.daily[network];
    const count = (db.prepare(`SELECT count(*) n FROM publications WHERE network=? AND status IN ('published','queued') AND created_at >= datetime('now','start of day')`).get(network) as any).n;
    if (count + emitted[network] >= max) continue;
    const job = rowToJob(row), text = network === 'x' ? xPost(job) : linkedinPost(job);
    emitted[network]++;
    if (dry) { logger.info(`[DRY RUN] ${network}:\n${text}`); continue; }
    // Buffer API access and plan eligibility vary. Until an explicitly verified API adapter is configured,
    // write a durable outbox rather than guessing an endpoint or losing a post.
    await mkdir(dirname('./data/buffer-outbox.jsonl'), { recursive: true });
    await appendFile('./data/buffer-outbox.jsonl', JSON.stringify({ network, channelId: config.buffer[network], text, url: job.url, createdAt: new Date().toISOString() }) + '\n');
    db.prepare(`INSERT OR IGNORE INTO publications(job_id,network,status,text,created_at) VALUES(?,?,'queued',?,?)`).run(row.id, network, text, new Date().toISOString());
    logger.warn(`Buffer fallback: queued ${network} post in data/buffer-outbox.jsonl`);
  }
}
