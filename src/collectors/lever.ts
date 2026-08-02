import { getJson } from '../http.js'; import type { RawJob } from '../types.js';
type Posting = { id: string; text: string; hostedUrl: string; createdAt?: number; descriptionPlain?: string; additionalPlain?: string; categories?: { location?: string; commitment?: string }; workplaceType?: string; salaryRange?: { currency?: string; min?: number; max?: number; interval?: string } };
export async function lever(site: string): Promise<RawJob[]> {
  // Official Postings API: https://github.com/lever/postings-api
  const data = await getJson<Posting[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`);
  return data.map(j => ({ externalId: j.id, title: j.text, company: site, location: j.categories?.location, description: [j.descriptionPlain, j.additionalPlain].filter(Boolean).join('\n'), postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : undefined, url: j.hostedUrl, source: 'lever', workplaceType: j.workplaceType, salary: j.salaryRange ? `${j.salaryRange.currency ?? ''} ${j.salaryRange.min ?? ''}-${j.salaryRange.max ?? ''} ${j.salaryRange.interval ?? ''}`.trim() : undefined }));
}
