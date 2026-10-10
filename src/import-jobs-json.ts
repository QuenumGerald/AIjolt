import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { upsert } from './db.js';
import type { Job } from './types.js';
import { logger } from './logger.js';

type JobsFile = { jobs?: Partial<Job>[] };

/** Recharge les offres déjà collectées (ex. data/jobs.json) dans SQLite — sans Foorilla. */
export function importJobsJson(inputPath = process.env.JOBS_JSON_PATH ?? './data/jobs.json'): number {
  const raw = JSON.parse(readFileSync(resolve(inputPath), 'utf8')) as JobsFile;
  let imported = 0;
  for (const item of raw.jobs ?? []) {
    if (!item.externalId || !item.url || !item.title || !item.source) continue;
    upsert({
      externalId: item.externalId,
      source: item.source as Job['source'],
      url: item.url,
      title: item.title,
      company: item.company ?? 'Unknown',
      location: item.location ?? 'Not specified',
      country: item.country ?? 'Unknown',
      workMode: (item.workMode as Job['workMode']) ?? 'unknown',
      salary: item.salary ?? null,
      description: item.description ?? item.title,
      postedAt: item.postedAt ?? null,
      skills: Array.isArray(item.skills) ? item.skills : [],
      aiRelevance: typeof item.aiRelevance === 'number' ? item.aiRelevance : 0,
      visaSponsored: Boolean(item.visaSponsored),
      score: typeof item.score === 'number' ? item.score : 0,
    });
    imported++;
  }
  logger.info(`Imported ${imported} jobs from ${resolve(inputPath)} into SQLite (Foorilla not used)`);
  return imported;
}
