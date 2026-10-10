export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export type PostedNetwork = 'x' | 'linkedin';

/** Offre exposée sur le site = annonce postée via AIJolt / Buffer. */
export interface PostedJob {
  externalId: string;
  title: string;
  company: string;
  location: string;
  country: string;
  workMode: WorkMode;
  description: string;
  postedAt: string | null;
  url: string;
  source: string;
  salary: string | null;
  skills: string[];
  score: number;
  networks: PostedNetwork[];
  socialPublishedAt: string | null;
  socialText: string | null;
}
