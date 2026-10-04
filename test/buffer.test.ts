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
  it('treats capacity 0 as unlimited so jobs are not capped by a 10-slot queue', () => {
    expect(jobSlotsToday({ capacity: 0, reserve: 0, jobQueued: 80, newsQueued: 20, jobsToday: 0, maxJobsPerDay: 480, maxPerCycle: 10 })).toBe(10);
    expect(newsToEvictForJobs({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 50, jobsWanted: 10 })).toBe(0);
  });
  it('still batches at most maxPerCycle jobs even with a high daily cap', () => {
    expect(jobSlotsToday({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 0, jobsToday: 100, maxJobsPerDay: 480, maxPerCycle: 10, emittedThisCycle: 0 })).toBe(10);
  });
  it('keeps news on its own small daily cap and does not steal job quota', () => {
    expect(newsSlotsToday({ capacity: 0, reserve: 0, jobQueued: 200, newsQueued: 0, newsToday: 0, maxNewsPerDay: 4 })).toBe(4);
    expect(newsSlotsToday({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 0, newsToday: 4, maxNewsPerDay: 4 })).toBe(0);
  });
});
