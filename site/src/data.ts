import feed from '../../data/posted-jobs.json';
import type { PostedJob } from './types';

export type { PostedJob };

type Feed = {
  generatedAt?: string;
  jobs?: PostedJob[];
};

const parsed = feed as Feed;

/** Uniquement les annonces postées via AIJolt (Buffer / X), pas le scrape brut. */
export const jobs = (parsed.jobs ?? []).filter(
  (job) => job.url && job.title && job.externalId,
) as PostedJob[];

export const generatedAt = parsed.generatedAt ?? null;
