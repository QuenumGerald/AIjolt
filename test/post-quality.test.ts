import { describe, expect, it } from 'vitest';
import { linkedinPost } from '../src/posts.js';
import { publishNews } from '../src/news-publisher.js';
import {
  cleanCompanyName,
  evaluateJobPost,
  isEnglishOrFrench,
  isGarbledTitle,
  postingSkills,
  shouldSkipForHistory,
  textsAreNearDuplicates,
} from '../src/post-quality.js';
import { normalize } from '../src/normalize.js';
import type { Job, RawJob } from '../src/types.js';

const base = (over: Partial<RawJob> = {}): Job => normalize({
  externalId: '1',
  title: 'Senior LLM Engineer',
  company: 'Acme',
  location: 'Remote, France',
  description: 'Build RAG agents with Python and LangChain.',
  url: 'https://example.com/jobs/1',
  source: 'lever',
  ...over,
});

describe('jobs-only X account', () => {
  it('never queues news or commentary posts', async () => {
    await expect(publishNews(false)).resolves.toBeUndefined();
  });
});

describe('company and title cleanup', () => {
  it('extracts Apple from careers page-title junk', () => {
    const title = 'Senior Data & AI Engineer - Find My';
    const company = 'Senior Data & AI Engineer - Find My - Jobs - Careers at Apple';
    expect(cleanCompanyName(company, title)).toBe('Apple');
    expect(isGarbledTitle(title, cleanCompanyName(company, title))).toBe(false);
    const verdict = evaluateJobPost(base({ title, company, description: 'Apple is hiring a data and AI engineer in Cupertino.' }));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.job.company).toBe('Apple');
  });

  it('rejects title equal to company', () => {
    const title = 'Software Engineer (Agentic)';
    expect(isGarbledTitle(title, title)).toBe(true);
    expect(evaluateJobPost(base({ title, company: title })).ok).toBe(false);
  });

  it('rejects Greenhouse-style Job Application for titles', () => {
    const title = 'Software Engineer, Intern - Labs (Summer 2027)';
    const company = 'Job Application for Software Engineer, Intern - Labs (Summer 2027)';
    expect(evaluateJobPost(base({ title, company })).ok).toBe(false);
  });

  it('rejects truncated company names', () => {
    expect(evaluateJobPost(base({ title: 'Full Stack Developer - IT Service Delivery', company: 'W...' })).ok).toBe(false);
    expect(evaluateJobPost(base({ title: 'Software Engineer', company: '(Shell)' })).ok).toBe(false);
  });
});

describe('location and language', () => {
  it('skips Not specified locations', () => {
    const verdict = evaluateJobPost(base({ location: '' }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/location/i);
  });

  it('skips Chinese campus recruiting posts', () => {
    expect(isEnglishOrFrench('NIO 27届校招 冲压设备工程师')).toBe(false);
    expect(evaluateJobPost(base({
      title: '冲压设备工程师（校招）',
      company: 'NIO',
      location: 'Hefei, China',
      description: '27届校招，负责冲压设备维护。',
    })).ok).toBe(false);
  });

  it('accepts English and French offers', () => {
    expect(isEnglishOrFrench('Senior LLM Engineer at Acme in Paris')).toBe(true);
    expect(evaluateJobPost(base({
      title: 'Ingénieur IA senior',
      company: 'Mistral',
      location: 'Paris, France',
      description: 'Vous concevez des agents LLM et des pipelines RAG.',
    })).ok).toBe(true);
  });
});

describe('skills from offer text only', () => {
  it('omits the skills line instead of inventing AI defaults', () => {
    const job = base({ title: 'Platform Engineer', description: 'Operate internal tooling and on-call for cloud services.' });
    expect(postingSkills(job)).toEqual([]);
    expect(linkedinPost(job)).not.toContain('Main skills');
    expect(linkedinPost(job)).not.toContain('Main skills:\nAI');
  });

  it('does not tag a campus equipment role from a distant AI footer', () => {
    const footer = `${'Company benefits and campus life. '.repeat(40)}We also research Python LLM RAG systems.`;
    const job = base({
      title: 'Stamping Equipment Engineer Campus Hire',
      company: 'NIO',
      location: 'San Jose, United States',
      description: `Maintain stamping press equipment on the factory floor.\n\n${footer}`,
    });
    expect(postingSkills(job)).toEqual([]);
  });

  it('keeps skills that actually appear in the offer lead-in', () => {
    const job = base({ title: 'Senior LLM Engineer', description: 'Build RAG agents with Python and LangChain.' });
    expect(postingSkills(job)).toEqual(expect.arrayContaining(['LLM', 'RAG', 'Python']));
    expect(linkedinPost(job)).toContain('Python');
  });
});

describe('duplicate and company burst guards', () => {
  it('treats slightly reworded Anthropic headlines as near-duplicates', () => {
    const a = 'Anthropic bans abusive or cruel behavior toward Claude in new usage policy';
    const b = 'Anthropic bans abusive or cruel behaviour toward Claude under an updated usage policy';
    expect(textsAreNearDuplicates(a, b)).toBe(true);
  });

  it('blocks the same company twice in a row and near-duplicate copy', () => {
    const job = base({ company: 'Lockheed Martin', title: 'AI Engineer' });
    expect(shouldSkipForHistory(job, 'Lockheed Martin is hiring an AI Engineer. Apply: https://example.com/jobs/1', [
      { company: 'Lockheed Martin', text: 'Previous Lockheed role' },
    ])).toMatch(/same company/);
    expect(shouldSkipForHistory(base({ company: 'Acme' }), 'Anthropic bans abusive or cruel behavior toward Claude', [
      { company: 'Other', text: 'Anthropic bans abusive or cruel behaviour toward Claude in policy' },
    ])).toMatch(/near-duplicate/);
  });

  it('blocks generated Not specified lines', () => {
    expect(shouldSkipForHistory(base(), 'Role at Acme\nLocation: Not specified\nApply: https://example.com/jobs/1', [])).toMatch(/Not specified/);
  });
});
