import { describe, expect, it } from 'vitest';
import { bufferDeletePostPayload, bufferGetPostPayload, classifyBufferPostResponse } from '../src/buffer.js';
import { jobSlotsToday, newsSlotsToday, newsToEvictForJobs } from '../src/queue-slots.js';

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
  it('lets jobs take all 10 daily slots when the queue is empty', () => {
    expect(jobSlotsToday({ capacity: 10, reserve: 0, jobQueued: 0, newsQueued: 0, jobsToday: 0, maxJobsPerDay: 10 })).toBe(10);
  });
  it('evicts queued news so 10 job posts can enter a full Buffer queue', () => {
    expect(newsToEvictForJobs({ capacity: 10, reserve: 0, jobQueued: 0, newsQueued: 10, jobsWanted: 10 })).toBe(10);
  });
  it('blocks news when jobs already used the 10 daily X posts', () => {
    expect(newsSlotsToday({ capacity: 10, reserve: 0, jobQueued: 10, newsQueued: 0, jobsToday: 10, newsToday: 0, maxNewsPerDay: 2, maxXPostsPerDay: 10 })).toBe(0);
  });
  it('allows leftover news only after jobs', () => {
    expect(newsSlotsToday({ capacity: 10, reserve: 0, jobQueued: 8, newsQueued: 0, jobsToday: 8, newsToday: 0, maxNewsPerDay: 2, maxXPostsPerDay: 10 })).toBe(2);
  });
});
