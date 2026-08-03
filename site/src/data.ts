import feed from '../../data/jobs.json';
import contentFeed from '../../data/articles.json';

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
export type Article = { id:number; type:string; title:string; slug:string; excerpt:string; markdown:string; html:string; seoTitle:string; seoDescription:string; image:string|null; publishedAt:string|null };
export const articles = contentFeed.articles as Article[];
