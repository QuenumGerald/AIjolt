import { config } from './config.js';
import { db, rowToJob } from './db.js';
import { bufferRequest } from './publisher.js';
import { bufferListChannelPostsPayload, extractApplyUrls, type BufferListedPost } from './buffer.js';
import { exportPublicFeeds } from './export-json.js';
import { importJobsJson } from './import-jobs-json.js';
import { getPostedStatus } from './posted-status.js';
import { logger } from './logger.js';

function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '').replace(/\?$/, '');
  } catch {
    return url.replace(/[?#].*$/, '').replace(/\/$/, '');
  }
}

function findJobIdByApplyUrl(url: string): number | null {
  const target = canonicalUrl(url);
  const rows = db.prepare(`SELECT id, url FROM jobs WHERE status='active'`).all() as Array<{ id: number; url: string }>;
  for (const row of rows) {
    if (canonicalUrl(row.url) === target || row.url === url || target.includes(canonicalUrl(row.url)) || canonicalUrl(row.url).includes(target)) {
      return row.id;
    }
  }
  // Match by path host+pathname without query drift
  for (const row of rows) {
    try {
      const a = new URL(row.url);
      const b = new URL(url);
      if (a.hostname === b.hostname && a.pathname.replace(/\/$/, '') === b.pathname.replace(/\/$/, '')) return row.id;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function networkForChannel(channelId: string): 'x' | 'linkedin' | null {
  if (channelId && channelId === config.buffer.x) return 'x';
  if (channelId && channelId === config.buffer.linkedin) return 'linkedin';
  return null;
}

async function fetchBufferPosts(statuses: Array<'sent' | 'scheduled'>): Promise<BufferListedPost[]> {
  const organizationId = config.buffer.organizationId;
  const channelIds = [config.buffer.x, config.buffer.linkedin].filter(Boolean) as string[];
  if (!organizationId) throw new Error('BUFFER_ORGANIZATION_ID is missing (required for Buffer backfill)');
  if (!channelIds.length) throw new Error('BUFFER_X_CHANNEL_ID or BUFFER_LINKEDIN_CHANNEL_ID is required');
  if (!config.buffer.token) throw new Error('BUFFER_ACCESS_TOKEN is missing');

  const posts: BufferListedPost[] = [];
  for (const status of statuses) {
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const payload = await bufferRequest(bufferListChannelPostsPayload({
        organizationId,
        channelIds,
        status,
        first: 50,
        after,
      })) as {
        errors?: Array<{ message?: string }>;
        data?: {
          posts?: {
            edges?: Array<{ node?: BufferListedPost | null }>;
            pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
          };
        };
      };
      const graphError = payload.errors?.map((e) => e.message).filter(Boolean).join('; ');
      if (graphError) throw new Error(`Buffer posts query failed: ${graphError}`);
      const connection = payload.data?.posts;
      for (const edge of connection?.edges ?? []) {
        if (edge.node?.id) posts.push(edge.node);
      }
      if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
      after = connection.pageInfo.endCursor;
    }
  }
  return posts;
}

function upsertPublication(jobId: number, network: 'x' | 'linkedin', post: BufferListedPost, status: 'published' | 'queued') {
  const createdAt = post.createdAt ?? new Date().toISOString();
  const dueAt = post.dueAt ?? null;
  db.prepare(`
    INSERT INTO publications(job_id,network,status,text,provider_id,created_at,due_at)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(job_id,network) DO UPDATE SET
      status=excluded.status,
      text=excluded.text,
      provider_id=excluded.provider_id,
      error=NULL,
      created_at=excluded.created_at,
      due_at=excluded.due_at
  `).run(jobId, network, status, post.text ?? '', post.id, createdAt, dueAt);
}

/** Reconstruit publications depuis Buffer (sent|scheduled) en matchant les URLs Apply des posts aux jobs SQLite. */
export async function backfillPostedFromBuffer(options: { importJobs?: boolean } = {}): Promise<{
  bufferPosts: number;
  matched: number;
  unmatched: number;
  exported: number;
}> {
  if (options.importJobs !== false) {
    try { importJobsJson(); } catch (error) {
      logger.warn(`import-jobs-json skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const posts = await fetchBufferPosts(['sent', 'scheduled']);
  let matched = 0;
  let unmatched = 0;
  for (const post of posts) {
    const network = networkForChannel(post.channelId ?? '') ?? 'x';
    const urls = extractApplyUrls(post.text ?? '');
    let jobId: number | null = null;
    for (const url of urls) {
      jobId = findJobIdByApplyUrl(url);
      if (jobId) break;
    }
    if (!jobId) {
      unmatched++;
      logger.warn(`Buffer post ${post.id} unmatched (no job URL in SQLite)`);
      continue;
    }
    const status = String(post.status ?? '').toLowerCase() === 'sent' || String(post.status ?? '').toLowerCase() === 'published'
      ? 'published'
      : 'queued';
    upsertPublication(jobId, network, post, status);
    matched++;
    const job = rowToJob(db.prepare(`SELECT * FROM jobs WHERE id=?`).get(jobId));
    logger.info(`Backfilled ${network} ${status} for ${job.title} @ ${job.company} ← ${post.id}`);
  }

  const exported = exportPublicFeeds().posted.jobs.length;
  return { bufferPosts: posts.length, matched, unmatched, exported };
}

/** Orchestration gateway : export si déjà des publications, sinon guide / backfill Buffer. */
export async function ensurePostedFeed(options: { fromBuffer?: boolean } = {}): Promise<void> {
  const before = getPostedStatus();
  process.stdout.write(`${JSON.stringify({ phase: 'before', ...before }, null, 2)}\n`);

  if (before.canExportWithoutFoorilla && !options.fromBuffer) {
    const exported = exportPublicFeeds().posted.jobs.length;
    logger.info(`Exported ${exported} posted jobs — Foorilla not required`);
    return;
  }

  if (options.fromBuffer) {
    const result = await backfillPostedFromBuffer();
    process.stdout.write(`${JSON.stringify({ phase: 'after-buffer-backfill', ...result, ...getPostedStatus() }, null, 2)}\n`);
    return;
  }

  if (before.activeJobs === 0) {
    importJobsJson();
  }
  const mid = getPostedStatus();
  process.stdout.write(`${JSON.stringify({ phase: 'after-import', ...mid }, null, 2)}\n`);
  logger.info('Aucune publication locale. Options: DRY_RUN=false npm run publish  OU  npm run backfill-posted -- --from-buffer');
}
