import { db } from './db.js';

type Network = 'x' | 'linkedin';

function validate(jobId: number, network: string): asserts network is Network {
  if (!Number.isInteger(jobId) || jobId <= 0) throw new Error('job-id must be a positive integer');
  if (network !== 'x' && network !== 'linkedin') throw new Error('network must be x or linkedin');
}

export function listOutbox(): void {
  const rows = db.prepare(`
    SELECT p.id, p.job_id AS jobId, p.network, p.status, p.created_at AS createdAt,
           j.company, j.title, j.url
    FROM publications p JOIN jobs j ON j.id=p.job_id
    WHERE p.status IN ('queued','failed')
    ORDER BY p.created_at ASC
  `).all();
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
}

export function acknowledgeOutbox(jobId: number, network: Network, providerId?: string): void {
  validate(jobId, network);
  const result = db.prepare(`
    UPDATE publications SET status='published', provider_id=?, error=NULL
    WHERE job_id=? AND network=? AND status='queued'
  `).run(providerId ?? null, jobId, network);
  if (!result.changes) throw new Error(`No queued ${network} publication for job ${jobId}`);
}

export function failOutbox(jobId: number, network: Network, error: string): void {
  validate(jobId, network);
  const result = db.prepare(`
    UPDATE publications SET status='failed', error=?
    WHERE job_id=? AND network=? AND status='queued'
  `).run(error, jobId, network);
  if (!result.changes) throw new Error(`No queued ${network} publication for job ${jobId}`);
}
