import { config } from './config.js'; import { greenhouse } from './collectors/greenhouse.js'; import { lever } from './collectors/lever.js'; import { ashby } from './collectors/ashby.js'; import { foorilla } from './collectors/foorilla.js';
import { normalize } from './normalize.js'; import { analyzeAI } from './ai.js'; import { upsert, db, rowToJob } from './db.js'; import { score } from './scoring.js'; import { logger } from './logger.js'; import { publish } from './publisher.js';
type Task = { board: { source: string; id: string; company: string }; load: () => Promise<import('./types.js').RawJob[]> };
export async function collect() {
  const run = db.prepare(`INSERT INTO runs(kind,status,started_at) VALUES('collect','running',?)`).run(new Date().toISOString()); let accepted = 0, errors = 0;
  const tasks: Task[] = [
    ...config.boards.greenhouse.map(board => ({ board, load: () => greenhouse(board.id, board.company) })),
    ...config.boards.lever.map(board => ({ board, load: () => lever(board.id, board.company) })),
    ...config.boards.ashby.map(board => ({ board, load: () => ashby(board.id, board.company) })),
  ];
  if (config.discovery.foorilla) tasks.push({ board: { source: 'foorilla', id: 'foorilla', company: 'Foorilla' }, load: () => foorilla(config.discovery.pages, config.discovery.baseUrl) });
  const results = await Promise.allSettled(tasks.map(task => task.load()));
  results.forEach((result, index) => {
    const { board } = tasks[index]; if (result.status === 'rejected') { errors++; logger.error(`${board.source}/${board.id}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`); return; }
    let boardAccepted = 0; for (const raw of result.value) { const ai = analyzeAI(raw); if (!ai.relevant) continue; const job = normalize(raw); if (!config.allowedCountries.has(job.country)) continue; upsert(job); accepted++; boardAccepted++; }
    logger.info(`${board.source}/${board.id}: ${result.value.length} received, ${boardAccepted} AI jobs accepted`);
  });
  db.prepare(`UPDATE runs SET status=?,details=?,finished_at=? WHERE id=?`).run(errors ? 'partial' : 'success', JSON.stringify({ accepted, errors }), new Date().toISOString(), run.lastInsertRowid); logger.info(`Collection complete: ${accepted} AI jobs, ${errors} errors`);
}
export function rescore() { const rows = db.prepare(`SELECT * FROM jobs WHERE status='active'`).all() as any[]; const update = db.prepare(`UPDATE jobs SET score=? WHERE source=? AND external_id=?`); db.transaction(() => rows.forEach(r => { const j = rowToJob(r); update.run(score(j), j.source, j.externalId); }))(); logger.info(`Scored ${rows.length} jobs`); }
export function cleanup() { const info = db.prepare(`UPDATE jobs SET status='expired', expires_at=? WHERE status='active' AND (last_seen_at < datetime('now','-30 days') OR (posted_at IS NOT NULL AND posted_at < datetime('now','-120 days')))` ).run(new Date().toISOString()); logger.info(`Expired ${info.changes} jobs`); }
export async function start() {
  let collecting = false, publishing = false;
  const collectCycle = async () => { if (collecting) return logger.warn('Skipping overlapping collection cycle'); collecting = true; try { await collect(); rescore(); cleanup(); } catch (error) { logger.error(`Collection cycle failed: ${error instanceof Error ? error.message : String(error)}`); } finally { collecting = false; } };
  const publishCycle = async () => { if (publishing) return logger.warn('Skipping overlapping publication cycle'); publishing = true; try { await publish(); } catch (error) { logger.error(`Publication cycle failed: ${error instanceof Error ? error.message : String(error)}`); } finally { publishing = false; } };
  await collectCycle(); await publishCycle(); setInterval(() => void collectCycle(), config.collectInterval * 60_000); setInterval(() => void publishCycle(), config.publishInterval * 60_000); logger.info('AIJolt scheduler started');
}
