import { analyzeAI } from './ai.js';
import type { Job, RawJob, WorkMode } from './types.js';

const strip = (s = '') => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#39;|&amp;/g, ' ').replace(/\s+/g, ' ').trim();
export function normalize(raw: RawJob): Job {
  const description = strip(raw.description), location = strip(raw.location) || 'Not specified';
  const text = `${location} ${raw.workplaceType ?? ''} ${description.slice(0, 1000)}`;
  let workMode: WorkMode = /remote/i.test(text) ? 'remote' : /hybrid/i.test(text) ? 'hybrid' : /on.?site|office/i.test(text) ? 'onsite' : 'unknown';
  const country = location.split(',').at(-1)?.trim() || 'Unknown';
  const ai = analyzeAI({ title: raw.title, description });
  const salaryMatch = description.match(/(?:[$€£]\s?[\d,.]+(?:\s*[-–]\s*[$€£]?\s?[\d,.]+)?(?:\s*(?:k|K|per year|\/year|p\.a\.))?)/);
  return { ...raw, title: strip(raw.title), company: strip(raw.company), location, country, workMode, description,
    postedAt: raw.postedAt && !Number.isNaN(Date.parse(raw.postedAt)) ? new Date(raw.postedAt).toISOString() : null,
    salary: raw.salary || salaryMatch?.[0] || null, skills: ai.skills, aiRelevance: ai.relevance,
    visaSponsored: /visa sponsor|sponsorship available|sponsor.*visa/i.test(description) && !/no visa sponsor|unable to sponsor/i.test(description), score: 0 };
}
