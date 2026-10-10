import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('posted jobs export', () => {
  let dir = '';
  let dbPath = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aijolt-posted-'));
    dbPath = join(dir, 'test.db');
    process.env.DATABASE_PATH = dbPath;
    vi.resetModules();
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exports only jobs with queued or published Buffer publications', async () => {
    process.env.DATABASE_PATH = dbPath;
    vi.resetModules();
    const { db, upsert } = await import('../src/db.js');
    const { listPostedJobs, exportPostedJobsJson } = await import('../src/export-json.js');

    upsert({
      externalId: 'posted-1',
      source: 'lever',
      url: 'https://example.com/jobs/posted-1',
      title: 'LLM Engineer',
      company: 'Acme',
      location: 'Remote, France',
      country: 'France',
      workMode: 'remote',
      salary: null,
      description: 'Build RAG systems with Python.',
      postedAt: '2026-10-01T00:00:00.000Z',
      skills: ['Python', 'RAG'],
      aiRelevance: 0.9,
      visaSponsored: false,
      score: 88,
    });
    upsert({
      externalId: 'unposted-2',
      source: 'lever',
      url: 'https://example.com/jobs/unposted-2',
      title: 'Data Analyst',
      company: 'Other',
      location: 'Paris',
      country: 'France',
      workMode: 'onsite',
      salary: null,
      description: 'Dashboards only.',
      postedAt: '2026-10-01T00:00:00.000Z',
      skills: ['SQL'],
      aiRelevance: 0.2,
      visaSponsored: false,
      score: 40,
    });

    const postedRow = db.prepare(`SELECT id FROM jobs WHERE external_id=?`).get('posted-1') as { id: number };
    db.prepare(
      `INSERT INTO publications(job_id,network,status,text,provider_id,created_at,due_at)
       VALUES(?,?,?,?,?,?,?)`,
    ).run(
      postedRow.id,
      'x',
      'published',
      'Hiring: LLM Engineer at Acme. Apply: https://example.com/jobs/posted-1',
      'buf_1',
      '2026-10-08T12:00:00.000Z',
      '2026-10-08T14:00:00.000Z',
    );

    const posted = listPostedJobs();
    expect(posted).toHaveLength(1);
    expect(posted[0].externalId).toBe('posted-1');
    expect(posted[0].networks).toEqual(['x']);
    expect(posted[0].socialPublishedAt).toBe('2026-10-08T14:00:00.000Z');
    expect(posted[0].socialText).toContain('LLM Engineer');

    const out = join(dir, 'posted-jobs.json');
    const payload = exportPostedJobsJson(out);
    expect(payload.jobs).toHaveLength(1);
    const disk = JSON.parse(readFileSync(out, 'utf8'));
    expect(disk.jobs[0].externalId).toBe('posted-1');
  });
});
