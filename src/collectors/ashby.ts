import { getJson } from '../http.js'; import type { RawJob } from '../types.js';
type Response = { jobs: Array<{ id?: string; title: string; location?: string; descriptionPlain?: string; publishedAt?: string; jobUrl: string; workplaceType?: string; compensation?: string }> };
export async function ashby(board: string): Promise<RawJob[]> {
  // Official public job posting API: https://developers.ashbyhq.com/docs/public-job-posting-api
  const data = await getJson<Response>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);
  return data.jobs.map(j => ({ externalId: j.id ?? j.jobUrl, title: j.title, company: board, location: j.location, description: j.descriptionPlain, postedAt: j.publishedAt, url: j.jobUrl, source: 'ashby', workplaceType: j.workplaceType, salary: j.compensation }));
}
