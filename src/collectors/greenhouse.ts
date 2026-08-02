import { getJson } from '../http.js'; import type { RawJob } from '../types.js';
type Response = { jobs: Array<{ id: number; title: string; location: { name: string }; absolute_url: string; updated_at?: string; content?: string; }> };
export async function greenhouse(board: string): Promise<RawJob[]> {
  // Official public Job Board API: https://developers.greenhouse.io/job-board.html
  const data = await getJson<Response>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`);
  return data.jobs.map(j => ({ externalId: String(j.id), title: j.title, company: board, location: j.location?.name, description: j.content, postedAt: j.updated_at, url: j.absolute_url, source: 'greenhouse' }));
}
