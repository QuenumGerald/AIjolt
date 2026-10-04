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
  it('lets jobs fill all 10 scheduled slots', () => {
    expect(jobSlotsToday({ capacity: 10, reserve: 0, jobQueued: 0, newsQueued: 0, jobsToday: 0, maxJobsPerDay: 48, maxPerCycle: 10 })).toBe(10);
  });
  it('evicts queued news when the 10 scheduled slots are full', () => {
    expect(newsToEvictForJobs({ capacity: 10, reserve: 0, jobQueued: 0, newsQueued: 10, jobsWanted: 10 })).toBe(10);
  });
  it('gives news no leftover when jobs occupy the scheduled queue', () => {
    expect(newsSlotsToday({ capacity: 10, reserve: 0, jobQueued: 10, newsQueued: 0, newsToday: 0, maxNewsPerDay: 2 })).toBe(0);
  });
  it('allows at most leftover news after jobs', () => {
    expect(newsSlotsToday({ capacity: 10, reserve: 0, jobQueued: 8, newsQueued: 0, newsToday: 0, maxNewsPerDay: 2 })).toBe(2);
  });
});
