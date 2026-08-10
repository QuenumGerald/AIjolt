export type Source = 'greenhouse' | 'lever' | 'ashby' | 'foorilla';
export type WorkMode = 'remote' | 'hybrid' | 'onsite' | 'unknown';
export interface RawJob { externalId: string; title: string; company: string; location?: string; description?: string; postedAt?: string; url: string; source: Source; salary?: string; workplaceType?: string; }
export interface Job extends Omit<RawJob, 'location'|'description'|'postedAt'|'salary'> { location: string; country: string; workMode: WorkMode; description: string; postedAt: string | null; salary: string | null; skills: string[]; aiRelevance: number; visaSponsored: boolean; score: number; }
export interface BoardConfig { source: Source; id: string; company: string; }

export type NewsSource = 'google-news' | 'hacker-news' | 'manual';
export interface NewsItem {
  externalId: string;
  source: NewsSource;
  url: string;
  title: string;
  summary: string;
  publisher: string;
  publishedAt: string;
  buzzScore: number;
}
