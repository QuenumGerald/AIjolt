import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseSource } from '../src/popculture/parse.js';
import { POP_SOURCES } from '../src/popculture/sources.js';
import type { PopSource } from '../src/popculture/types.js';
import { assessRelevance } from '../src/popculture/relevance.js';
import { verifyNativeUrl } from '../src/popculture/native.js';

const now = new Date('2026-11-20T19:00:00Z');
const source = (id: string): PopSource => POP_SOURCES.find(s => s.id === id) ?? ({ id, publisher: id, url: 'https://example.com/video', kind: id as PopSource['kind'], defaultCategory: 'news' });
const next = (v: unknown) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(v)}</script>`;

describe('multitopic video collectors', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('rejects general news, animals and weather while retaining promo rejection', () => {
    for (const title of ['Dog rescued from flooded home', 'Incredible tornado crosses highway', 'NBA player wins championship', 'Rocket mission reaches orbit', 'Plane makes emergency landing']) expect(assessRelevance(title, '').ok).toBe(false);
    expect(assessRelevance('Sponsored post shop now for giveaway', '').ok).toBe(false);
  });
  it('extracts NBC embedded metadata while rejecting live, ads and videos over 140 seconds', () => {
    const base = {id:'video-1',liveVideoStatus:'NONE',nativeAd:false,datePublished:'Fri Nov 20 2026 18:00:00 GMT+0000 (UTC)',headline:{primary:'Dog rescued from raging flood'},description:{primary:'A rescue captured on camera'},url:{primary:'https://www.nbcnews.com/video/dog-rescued'},videoAssets:[{assetType:'akamaiMp4',publicUrl:'https://cdn.example.com/dog.mp4',assetDuration:45}]};
    const rows=parseSource(source('nbc-video'),next({items:[base,{...base,url:{primary:'https://www.nbcnews.com/video/live'},liveVideoStatus:'LIVE'},{...base,url:{primary:'https://www.nbcnews.com/video/ad'},nativeAd:true},{...base,url:{primary:'https://www.nbcnews.com/video/long'},videoAssets:[{...base.videoAssets[0],assetDuration:141}]}]}),now);
    expect(rows).toHaveLength(2); expect(rows.find(x=>x.url.endsWith('dog-rescued'))?.status).toBe('rejected'); expect(rows.find(x=>x.url.endsWith('/long'))?.status).toBe('rejected');
  });
  it('extracts TMZ JSON objects without executing page scripts', () => {
    const item={status:'published',is_unlisted:false,slug:'dog-saves-child',title:'Dog saves child from flood',description:'The animal rushed to help',published_at:'2026-11-20T18:00:00Z',duration:38,kaltura_mp4_url:'https://ovp.tmz.com/video/dog.mp4'};
    const html=`<a href="https://www.tmz.com/watch/dog-saves-child/">story</a><script>window.TMZ.actions.loadWidget({}, {}, ${JSON.stringify({results:[item]})}); globalThis.compromised=true;</script>`;
    const rows=parseSource(source('tmz-watch'),html,now); expect(rows).toHaveLength(1);expect(rows[0].video.url).toBe(item.kaltura_mp4_url);expect((globalThis as Record<string,unknown>).compromised).toBeUndefined();
  });
  it('extracts ET and discards stale entries', () => {
    const row={url:'/media/videos/film-interview',field_display_headline:'Actor discusses new film',display_date:'2026-11-20T18:00:00Z',field_video_duration:'45',mpx_downloadable_video_data_url:'https://cdn.example.com/movie.mp4',is_promotional:false,is_unlisted:false};
    expect(parseSource(source('et-video'),next({initialResults:[row]}),now)).toHaveLength(1);
    expect(parseSource(source('et-video'),next({initialResults:[{...row,display_date:'2026-10-01T18:00:00Z'}]}),now)).toHaveLength(0);
  });
  it('uses the Euronews video duration in milliseconds and exact article metadata', () => {
    const row={article:{canonical:'https://www.euronews.com/video/story',title:'New discovery on planet Mars',leadin:'Scientists explore space',publishedAt:1795197600},video:{internalVideo:{url:'https://video.euronews.com/v.mp4',duration:119680},playerData:{isLive:false}}};
    const html=`<script>window.getInitialServerData = () => (${JSON.stringify({item:row})});</script>`;
    const rows=parseSource(source('euronews-video'),html,now);expect(rows).toHaveLength(1);expect(rows[0].video.durationSeconds).toBe(119.68);
  });
  it('accepts binary/octet-stream only when it is a real MP4', async () => {
    const mp4=Buffer.from([0,0,0,24,...Buffer.from('ftypisom'),0,0,0,0]);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(mp4,{status:206,headers:{'content-type':'binary/octet-stream','content-range':'bytes 0-15/1000'}})));
    await expect(verifyNativeUrl('https://video.euronews.com/v.mp4')).resolves.toBeUndefined();
  });
});
