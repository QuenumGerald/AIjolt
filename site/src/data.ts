import feed from '../../data/jobs.json';

export type Job = {
  externalId: string;
  title: string;
  company: string;
  location: string;
  country: string;
  workMode: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  description: string;
  postedAt: string | null;
  url: string;
  source: string;
  salary: string | null;
  skills: string[];
  score: number;
};

export const jobs = (feed.jobs as Job[]).filter((job) => job.url && job.title);
export const generatedAt = feed.generatedAt;
