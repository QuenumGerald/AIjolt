import type { Job } from './types.js';
const canonical = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
export const dedupeKey = (j: Pick<Job, 'company'|'title'|'location'>) => [j.company, j.title, j.location].map(canonical).join('|');
export function deduplicate(jobs: Job[]): Job[] { const seen = new Set<string>(); return jobs.filter(j => { const keys = [j.url.replace(/[?#].*$/, '').replace(/\/$/, ''), dedupeKey(j)]; if (keys.some(k => seen.has(k))) return false; keys.forEach(k => seen.add(k)); return true; }); }
