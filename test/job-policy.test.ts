import { describe, expect, it, vi } from 'vitest';
import { normalize } from '../src/normalize.js';
import { generatePost } from '../src/posts.js';
import { isTechnicalRole, isVerifiedEmployer, jobCity, salaryForPost, formatNoxPost, noxJobRejection } from '../src/job-policy.js';
import type { BoardConfig, RawJob } from '../src/types.js';

const boards: BoardConfig[] = [
  { source:'greenhouse', id:'anthropic', company:'Anthropic' },
  { source:'ashby', id:'perplexity', company:'Perplexity' },
  { source:'lever', id:'spotify', company:'Spotify' },
];
const raw: RawJob = { source:'greenhouse', externalId:'123', company:'Anthropic', title:'Senior Software Engineer, Backend', location:'San Francisco, CA | New York City, NY', salary:'$220,000', url:'https://job-boards.greenhouse.io/anthropic/jobs/123', description:'Build reliable backend software in Python.' };

it('allows engineering/development/data/ML/research even without AI in title', () => {
  for(const title of [
    'Senior Software Engineer, Backend', 'Full Stack Developer', 'Data Analyst', 'Senior Data Engineer',
    'Machine Learning Scientist', 'Principal ML Engineer', 'Security Engineer', 'DevOps Engineer',
    'Research Scientist - Reinforcement Learning', 'Applied Data Researcher', 'Cloud Infrastructure Engineer',
    'Member of Technical Staff (Software Engineer, AI Policy)', 'AI Architect', 'Bioinformatics Engineer',
  ]) expect(isTechnicalRole(title), title).toBe(true);
});

it('rejects sales, recruiting, support, marketing, product and non-technical roles even in AI companies', () => {
  for(const title of [
    'Account Executive, Air Force', 'Manager, Enterprise Sales - Hedge Funds', 'Sales Engineer',
    'Recruiter, Applied AI', 'Talent Acquisition Engineering Partner', 'Customer Support Engineer',
    'Staff Software Engineer, Support Technology', 'Technical Support Specialist',
    'GTM Engineer, Revenue Operations', 'Director of Business Development',
    'Account Manager', 'Marketing Analytics Engineer', 'Product Manager, AI Research',
    'Technical Program Manager, Life Sciences Research', 'Salesforce Developer',
    'Ingénieur logiciel', 'Desarrollador backend', 'Public Policy Manager',
    'Staff Research Recruiting Lead', 'Partner Solutions Architect', 'Senior Solutions Architect, Sales',
  ]) expect(isTechnicalRole(title), title).toBe(false);
});

it('allows only configured and source-matched official employers; Foorilla alone never proves employer identity', () => {
  expect(isVerifiedEmployer(raw, boards)).toBe(true);
  expect(isVerifiedEmployer({...raw,source:'foorilla'}, boards)).toBe(false);
  expect(isVerifiedEmployer({...raw,company:'Acme AI'}, boards)).toBe(false);
  expect(isVerifiedEmployer({...raw,company:'Anthropic',source:'ashby'}, boards)).toBe(false);
  expect(isVerifiedEmployer({...raw,company:'perplexity',source:'ashby'}, boards)).toBe(true);
  expect(noxJobRejection(normalize({...raw,title:'Sales Engineer'}),boards)).toMatch(/not an engineering/);
  expect(noxJobRejection(normalize({...raw,company:'Unknown AI Hiring Co'}),boards)).toMatch(/unverified employer/);
});

it('extracts an actual city, without inventing a city from remote-only or missing locations', () => {
  expect(jobCity('San Francisco, CA | New York City, NY')).toBe('San Francisco');
  expect(jobCity('Remote-Friendly (Travel-Required) | Seattle, WA | New York City, NY')).toBe('Seattle');
  expect(jobCity('London, UK; Ontario, CAN; San Francisco, CA')).toBe('London');
  expect(jobCity('San Mateo, CA, United States')).toBe('San Mateo');
  expect(jobCity('Remote - United States')).toBeNull();
  expect(jobCity('Not specified')).toBeNull();
  expect(jobCity('United States')).toBeNull();
});

it('does not invent salaries from bogus short dollar snippets', () => {
  expect(salaryForPost(null)).toBe('Not disclosed');
  expect(salaryForPost('$10')).toBe('Not disclosed');
  expect(salaryForPost('N/A')).toBe('Not disclosed');
  expect(salaryForPost('$230,000')).toBe('$230,000');
  expect(salaryForPost('$300K – $405K • Offers Equity')).toBe('$300K – $405K');
  expect(salaryForPost('€265.000')).toBe('€265.000');
});

it('produces exactly one English X template with full role, city, salary and application URL', async () => {
  const job=normalize(raw);
  const expected=`Anthropic is hiring a Senior Software Engineer, Backend in San Francisco. Salary: $220,000. Apply: ${raw.url}`;
  expect(formatNoxPost(job)).toBe(expected);
  const remote = vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('API must not be called for X'));
  try { expect(await generatePost(job,'x')).toBe(expected); expect(remote).not.toHaveBeenCalled(); }
  finally { remote.mockRestore(); }
  expect(noxJobRejection(job,boards)).toBeNull();
  expect(formatNoxPost({...job,salary:'$10'})).toContain('Salary: Not disclosed. Apply:');
  expect(formatNoxPost({...job,location:'Remote - United States'})).toBeNull();
  expect(formatNoxPost({...job,title:'Staff '.repeat(45)+'Engineer'})).toBeNull();
});
