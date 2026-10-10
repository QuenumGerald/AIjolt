import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { db, rowToJob } from './db.js';
import type { Job } from './types.js';

export interface PublicJobsFile {
  generatedAt: string;
  jobs: Job[];
}

export type PostedNetwork = 'x' | 'linkedin';

export interface PostedJob extends Job {
  /** Réseaux où l’annonce a été mise en file ou publiée via AIJolt / Buffer. */
  networks: PostedNetwork[];
  /** Première date de mise en file / publication sociale. */
  socialPublishedAt: string | null;
  /** Texte du post social (préférence X). */
  socialText: string | null;
}

export interface PostedJobsFile {
  generatedAt: string;
  /** Uniquement les offres effectivement postées (queued|published) via Buffer/X. */
  jobs: PostedJob[];
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
  writeJson(outputPath, payload);
  console.log(`Exported ${payload.jobs.length} jobs to ${resolve(outputPath)}`);
  return payload;
}

/** Offres liées à au moins une publication sociale queued|published. */
export function listPostedJobs(): PostedJob[] {
  const rows = db.prepare(`
    SELECT j.*,
      (
        SELECT GROUP_CONCAT(DISTINCT p.network)
        FROM publications p
        WHERE p.job_id = j.id AND p.status IN ('published', 'queued')
      ) AS networks,
      (
        SELECT MIN(COALESCE(p.due_at, p.created_at))
        FROM publications p
        WHERE p.job_id = j.id AND p.status IN ('published', 'queued')
      ) AS social_published_at,
      (
        SELECT p.text
        FROM publications p
        WHERE p.job_id = j.id AND p.status IN ('published', 'queued')
        ORDER BY CASE p.network WHEN 'x' THEN 0 ELSE 1 END, datetime(COALESCE(p.due_at, p.created_at)) ASC
        LIMIT 1
      ) AS social_text
    FROM jobs j
    WHERE j.status = 'active'
      AND EXISTS (
        SELECT 1 FROM publications p
        WHERE p.job_id = j.id AND p.status IN ('published', 'queued')
      )
    ORDER BY datetime(social_published_at) DESC, j.score DESC
  `).all() as any[];

  return rows.map((row) => {
    const job = rowToJob(row);
    const networks = String(row.networks ?? '')
      .split(',')
      .map((n: string) => n.trim())
      .filter((n: string): n is PostedNetwork => n === 'x' || n === 'linkedin');
    return {
      ...job,
      networks,
      socialPublishedAt: row.social_published_at ?? null,
      socialText: row.social_text ?? null,
    };
  });
}

export function exportPostedJobsJson(
  outputPath = process.env.POSTED_JOBS_JSON_PATH ?? './data/posted-jobs.json',
) {
  const payload: PostedJobsFile = {
    generatedAt: new Date().toISOString(),
    jobs: listPostedJobs(),
  };
  writeJson(outputPath, payload);
  console.log(`Exported ${payload.jobs.length} posted jobs to ${resolve(outputPath)}`);
  return payload;
}

/** Exporte le feed complet + le feed SEO (annonces postées). */
export function exportPublicFeeds() {
  const all = exportJobsJson();
  const posted = exportPostedJobsJson();
  return { all, posted };
}

function writeJson(outputPath: string, payload: unknown) {
  const target = resolve(outputPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}
