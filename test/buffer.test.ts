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
  it('treats capacity 0 as unlimited and still posts one job per 30 min cycle', () => {
    expect(jobSlotsToday({ capacity: 0, reserve: 0, jobQueued: 80, newsQueued: 20, jobsToday: 0, maxJobsPerDay: 48, maxPerCycle: 1 })).toBe(1);
    expect(newsToEvictForJobs({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 50, jobsWanted: 10 })).toBe(0);
  });
  it('stops jobs at the 48/day X cap even with an unlimited queue', () => {
    expect(jobSlotsToday({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 0, jobsToday: 48, maxJobsPerDay: 48, maxPerCycle: 1 })).toBe(0);
  });
  it('keeps news on a small daily cap so it cannot flood an unlimited queue', () => {
    expect(newsSlotsToday({ capacity: 0, reserve: 0, jobQueued: 200, newsQueued: 0, newsToday: 0, maxNewsPerDay: 2 })).toBe(2);
    expect(newsSlotsToday({ capacity: 0, reserve: 0, jobQueued: 0, newsQueued: 0, newsToday: 2, maxNewsPerDay: 2 })).toBe(0);
  });
});
