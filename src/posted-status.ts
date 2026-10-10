import { db } from './db.js';
import { listPostedJobs } from './export-json.js';
import { logger } from './logger.js';

export type PostedStatus = {
  activeJobs: number;
  publicationsQueued: number;
  publicationsPublished: number;
  postedFeedJobs: number;
  canExportWithoutFoorilla: boolean;
  nextStep: string;
};

export function getPostedStatus(): PostedStatus {
  const activeJobs = (db.prepare(`SELECT count(*) n FROM jobs WHERE status='active'`).get() as { n: number }).n;
  const publicationsQueued = (db.prepare(`SELECT count(*) n FROM publications WHERE status='queued'`).get() as { n: number }).n;
  const publicationsPublished = (db.prepare(`SELECT count(*) n FROM publications WHERE status='published'`).get() as { n: number }).n;
  const postedFeedJobs = listPostedJobs().length;
  const canExportWithoutFoorilla = publicationsQueued + publicationsPublished > 0;
  let nextStep: string;
  if (canExportWithoutFoorilla) {
    nextStep = 'npm run export-json  # remplit data/posted-jobs.json sans Foorilla';
  } else if (activeJobs > 0) {
    nextStep = 'DRY_RUN=false npm run publish  # puis export-json (jobs déjà en DB, Foorilla inutile)';
  } else {
    nextStep = 'npm run import-jobs-json  # charge data/jobs.json en SQLite, puis publish + export-json';
  }
  return {
    activeJobs,
    publicationsQueued,
    publicationsPublished,
    postedFeedJobs,
    canExportWithoutFoorilla,
    nextStep,
  };
}

export function printPostedStatus(): void {
  const status = getPostedStatus();
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  logger.info(
    status.canExportWithoutFoorilla
      ? 'Gateway prêt: des publications queued|published existent — Foorilla non requis pour le site.'
      : 'Aucune publication sociale en DB — le site restera vide jusqu’à publish ou backfill Buffer.',
  );
  logger.info(`Next: ${status.nextStep}`);
}
