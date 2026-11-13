import type { Job } from './types.js';
import { isTechnicalRole } from './job-policy.js';
export function score(job: Job, now = new Date()): number {
  const age = job.postedAt ? Math.max(0, (now.getTime() - Date.parse(job.postedAt)) / 864e5) : 30;
  const freshness = Math.max(0, 30 - Math.min(30, age));
  const quality = Math.min(15, job.description.length / 200);
  return Math.round((freshness + (job.salary ? 12 : 0) + (job.workMode === 'remote' ? 12 : job.workMode === 'hybrid' ? 5 : 0) + (job.visaSponsored ? 10 : 0) + quality + (isTechnicalRole(job.title) ? 21 : 0)) * 100) / 100;
}
