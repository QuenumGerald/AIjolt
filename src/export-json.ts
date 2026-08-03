import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { db, rowToJob } from './db.js';

export interface PublicJobsFile {
  generatedAt: string;
  jobs: ReturnType<typeof rowToJob>[];
}

export function exportJobsJson(outputPath = process.env.JOBS_JSON_PATH ?? './data/jobs.json') {
  const rows = db.prepare(`
    SELECT * FROM jobs
    WHERE status = 'active'
    ORDER BY score DESC, COALESCE(posted_at, first_seen_at) DESC
  `).all() as any[];
  const payload: PublicJobsFile = {
    generatedAt: new Date().toISOString(),
    jobs: rows.map(rowToJob),
  };
  const target = resolve(outputPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Exported ${payload.jobs.length} jobs to ${target}`);
}
