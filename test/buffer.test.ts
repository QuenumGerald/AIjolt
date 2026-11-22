import { describe, expect, it } from 'vitest';
import { bufferCreatePostPayload, bufferDeletePostPayload, bufferGetPostPayload, classifyBufferPostResponse } from '../src/buffer.js';
import { jobSlotsToday, newsSlotsToday, newsToEvictForJobs } from '../src/queue-slots.js';
import { nextCustomDueAt } from '../src/schedule.js';
import { clampJobsPerCycle, nextRequestWaitMs, parseRetryAfterSeconds } from '../src/throttle.js';

describe('Buffer status synchronization', () => {
  it('builds a post lookup payload', () => {
    expect(bufferGetPostPayload('post-1').variables.id).toBe('post-1');
  });
  it('maps sent posts to published', () => {
    expect(classifyBufferPostResponse({ data: { post: { status: 'sent' } } })).toEqual({ kind: 'published', status: 'sent' });
  });
  it('keeps scheduled posts queued', () => {
    expect(classifyBufferPostResponse({ data: { post: { status: 'scheduled' } } })).toEqual({ kind: 'queued', status: 'scheduled' });
  });
  it('maps missing posts to missing', () => {
    expect(classifyBufferPostResponse({ errors: [{ message: 'Post not found' }] })).toEqual({ kind: 'missing', message: 'Post not found' });
  });
  it('maps unexpected failures to failed', () => {
    expect(classifyBufferPostResponse({ data: { post: { status: 'error', error: { message: 'Rejected' } } } })).toEqual({ kind: 'failed', message: 'Rejected' });
  });
  it('deletes a queued post by id', () => {
    const payload = bufferDeletePostPayload('post-9');
    expect(payload.variables.id).toBe('post-9');
    expect(payload.query).toContain('deletePost');
  });
});

describe('shared Buffer X quota', () => {
  it('treats capacity 0 as unlimited and still posts two jobs per 30 min cycle', () => {
    expect(jobSlotsToday({ capacity: 0, reserve: 0, jobQueued: 80, newsQueued: 20, jobsToday: 0, newsToday: 3, maxJobsPerDay: 88, maxXPostsPerDay: 100, maxPerCycle: 2 })).toBe(2);
    expect(newsToEvictForJobs({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 50, jobsWanted: 10 })).toBe(0);
  });
  it('stops jobs at 88/day and still allows leftover news under the 100 X verified budget', () => {
    expect(jobSlotsToday({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 0, jobsToday: 88, newsToday: 0, maxJobsPerDay: 88, maxXPostsPerDay: 100, maxPerCycle: 2 })).toBe(0);
    expect(newsSlotsToday({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 0, jobsToday: 88, newsToday: 0, maxNewsPerDay: 10, maxXPostsPerDay: 100, maxPerCycle: 1 })).toBe(1);
  });
  it('posts news even while jobs are still waiting, up to 10/day', () => {
    expect(newsSlotsToday({ capacity: 0, reserve: 0, jobQueued: 200, newsQueued: 0, jobsToday: 10, newsToday: 0, maxNewsPerDay: 10, maxXPostsPerDay: 100, maxPerCycle: 1 })).toBe(1);
    expect(newsSlotsToday({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 0, jobsToday: 10, newsToday: 10, maxNewsPerDay: 10, maxXPostsPerDay: 100 })).toBe(0);
  });
  it('never lets jobs plus news exceed 100 X verified posts in a day', () => {
    expect(jobSlotsToday({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 0, jobsToday: 88, newsToday: 12, maxJobsPerDay: 88, maxXPostsPerDay: 100, maxPerCycle: 2 })).toBe(0);
    expect(newsSlotsToday({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 0, jobsToday: 90, newsToday: 10, maxNewsPerDay: 10, maxXPostsPerDay: 100 })).toBe(0);
  });
  it('spaces custom dueAt times 20 minutes apart', () => {
    const first = nextCustomDueAt(1_000_000, null, 20, 5);
    expect(Date.parse(first)).toBe(1_000_000 + 5 * 60_000);
    const second = nextCustomDueAt(1_000_000, Date.parse(first), 20, 5);
    expect(Date.parse(second) - Date.parse(first)).toBe(20 * 60_000);
  });
});

describe('Buffer API throttling', () => {
  it('refuses more than two job creates per cycle even if env asks for a batch', () => {
    expect(clampJobsPerCycle(10)).toBe(2);
    expect(clampJobsPerCycle(1)).toBe(1);
  });
  it('waits the configured gap between GraphQL calls', () => {
    expect(nextRequestWaitMs(1000, 1500, 1500)).toBe(1000);
    expect(nextRequestWaitMs(1000, 3000, 1500)).toBe(0);
  });
  it('reads Retry-After without inventing a longer wait', () => {
    expect(parseRetryAfterSeconds('60')).toBe(60);
    expect(parseRetryAfterSeconds(null)).toBe(60);
  });
});
