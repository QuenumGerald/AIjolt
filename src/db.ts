import Database from 'better-sqlite3'; import { mkdirSync, readFileSync } from 'node:fs'; import { dirname } from 'node:path';
import { config } from './config.js'; import { dedupeKey } from './dedupe.js'; import type { Job } from './types.js';
mkdirSync(dirname(config.databasePath), { recursive: true });
export const db = new Database(config.databasePath); db.pragma('busy_timeout = 5000'); db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
export function upsert(job: Job) {
  const now = new Date().toISOString();
  const key = dedupeKey(job);
  const duplicate = db.prepare(`SELECT id FROM jobs WHERE dedupe_key=? AND NOT (source=? AND external_id=?)`).get(key, job.source, job.externalId) as {id:number}|undefined;
  if (duplicate) {
    db.prepare(`UPDATE jobs SET last_seen_at=?, status='active' WHERE id=?`).run(now, duplicate.id);
    return;
  }
  db.prepare(`INSERT INTO jobs(source,external_id,url,dedupe_key,title,company,location,country,work_mode,salary,description,posted_at,first_seen_at,last_seen_at,skills_json,ai_relevance,visa_sponsored,score)
  VALUES(@source,@externalId,@url,@key,@title,@company,@location,@country,@workMode,@salary,@description,@postedAt,@now,@now,@skills,@aiRelevance,@visa,@score)
  ON CONFLICT(source,external_id) DO UPDATE SET url=excluded.url,dedupe_key=excluded.dedupe_key,title=excluded.title,location=excluded.location,country=excluded.country,work_mode=excluded.work_mode,salary=excluded.salary,description=excluded.description,posted_at=excluded.posted_at,last_seen_at=excluded.last_seen_at,skills_json=excluded.skills_json,ai_relevance=excluded.ai_relevance,visa_sponsored=excluded.visa_sponsored,status='active'`).run({ ...job, key, skills: JSON.stringify(job.skills), visa: Number(job.visaSponsored), now });
}
export function rowToJob(row: any): Job { return { externalId: row.external_id, source: row.source, url: row.url, title: row.title, company: row.company, location: row.location, country: row.country, workMode: row.work_mode, salary: row.salary, description: row.description, postedAt: row.posted_at, skills: JSON.parse(row.skills_json), aiRelevance: row.ai_relevance, visaSponsored: Boolean(row.visa_sponsored), score: row.score }; }
