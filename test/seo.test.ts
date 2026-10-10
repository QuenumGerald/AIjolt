import { describe, expect, it } from 'vitest';
import {
  jobCanonical,
  jobMetaDescription,
  jobPath,
  jobPostingJsonLd,
  jobSlug,
  jobTitleTag,
  itemListJsonLd,
} from '../site/src/lib/seo.ts';
import type { PostedJob } from '../site/src/types.ts';

const job: PostedJob = {
  externalId: 'Senior-LLM-Engineer-Acme-42',
  title: 'Senior LLM Engineer',
  company: 'Acme',
  location: 'Remote, France',
  country: 'France',
  workMode: 'remote',
  description: 'Build production RAG agents with Python and evaluation harnesses. Full-time role.',
  postedAt: '2026-10-01T00:00:00.000Z',
  url: 'https://boards.example.com/jobs/42',
  source: 'lever',
  salary: null,
  skills: ['Python', 'RAG', 'LLM'],
  score: 90,
  networks: ['x'],
  socialPublishedAt: '2026-10-08T14:00:00.000Z',
  socialText: 'Hiring Senior LLM Engineer @ Acme',
};

describe('site SEO helpers', () => {
  it('builds stable slugs and paths', () => {
    expect(jobSlug(job)).toBe('senior-llm-engineer-acme-42');
    expect(jobPath(job)).toBe('/jobs/senior-llm-engineer-acme-42');
    expect(jobPath(job, 'en')).toBe('/en/jobs/senior-llm-engineer-acme-42');
    expect(jobCanonical(job)).toBe('https://aijolt.pages.dev/jobs/senior-llm-engineer-acme-42');
    expect(jobCanonical(job, 'en')).toBe('https://aijolt.pages.dev/en/jobs/senior-llm-engineer-acme-42');
  });

  it('builds unique title and description', () => {
    expect(jobTitleTag(job)).toBe('Senior LLM Engineer — Acme | AIJolt');
    expect(jobMetaDescription(job).length).toBeLessThanOrEqual(160);
    expect(jobMetaDescription(job)).toContain('Acme');
  });

  it('emits JobPosting JSON-LD with TELECOMMUTE for remote', () => {
    const ld = jobPostingJsonLd(job);
    expect(ld['@type']).toBe('JobPosting');
    expect(ld.title).toBe(job.title);
    expect(ld.url).toBe(jobCanonical(job));
    expect(ld.datePosted).toBe('2026-10-08T14:00:00.000Z');
    expect(ld.jobLocationType).toBe('TELECOMMUTE');
    expect(ld.employmentType).toBe('FULL_TIME');
    expect((ld.hiringOrganization as { name: string }).name).toBe('Acme');
  });

  it('emits ItemList for the homepage', () => {
    const list = itemListJsonLd([job]);
    expect(list['@type']).toBe('ItemList');
    expect(list.numberOfItems).toBe(1);
    expect(list.itemListElement[0].url).toContain('/jobs/');
  });
});
