import { describe, it, expect, vi } from 'vitest';
import { collectPeerTube, peerTubeFile } from '../src/popculture/peertube.js';

describe('PeerTube native collection', () => {
  it('selects same-host MP4 only, excluding audio and oversized files', () => {
    const f = (url: string, id: number, size = 1000) => ({fileUrl:url, resolution:{id},size});
    const good = 'https://koreus.tv/720-fragmented.mp4';
    expect(peerTubeFile({files:[f('https://other.example/720.mp4',720), f('https://koreus.tv/audio.mp4',0),
      f('https://koreus.tv/large.mp4',720,600000000), f(good,720)]},'koreus.tv')).toBe(good);
  });
  it('accepts only fresh local public videos with a real verified native file', async () => {
    const now = new Date('2026-11-25T01:00:00Z');
    const row = {uuid:'a1234567-1234-1234-1234-123456789abc', name:'Mini-océan imprimé en 3D',
      nsfw:false,isLocal:true,privacy:{id:1},duration:19,publishedAt:now.toISOString(),account:{id:1}};
    const verify = vi.fn(async () => {});
    const fetch = vi.fn(async (url: string) => JSON.stringify(url.includes('?') ?
      {data:url.includes('koreus.tv') ? [row,{...row,nsfw:true},{...row,isLocal:false}] : []} :
      {...row,files:[{fileUrl:'https://koreus.tv/720.mp4',resolution:{id:720},size:10000}]}));
    const r = await collectPeerTube(fetch,verify,now,72,45);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].category).toBe('viral');
    expect(verify).toHaveBeenCalledTimes(1);
    const failed = await collectPeerTube(fetch,async () => {throw Error('not an MP4')},now,72,45);
    expect(failed.items).toHaveLength(0);
  });
});
