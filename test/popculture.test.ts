import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { channelGuard, popConfig, publishGate } from '../src/popculture/config.js';
import { parseSource } from '../src/popculture/parse.js';
import { formatPost } from '../src/popculture/posts.js';
import { popPostPayload, publishPop } from '../src/popculture/publish.js';
import { assessRelevance, titlesMatch } from '../src/popculture/relevance.js';
import { openPopDb, upsertItem, listQueue } from '../src/popculture/store.js';
import { assessVideo, classifyVideoReference, pickJwMp4 } from '../src/popculture/video.js';
import type { DraftItem, PopSource } from '../src/popculture/types.js';

const moviefone: PopSource = { id: 'moviefone-trailers', publisher: 'Moviefone', url: 'https://www.moviefone.com/feeds/trailers.json', kind: 'json-feed', defaultCategory: 'trailer' };
const kino: PopSource = { id: 'kinocheck', publisher: 'KinoCheck', url: 'https://api.kinocheck.com/trailers/latest', kind: 'kinocheck', defaultCategory: 'trailer' };
const variety: PopSource = { id: 'variety', publisher: 'Variety', url: 'https://variety.com/feed/', kind: 'rss' };

describe('channel isolation', () => {
  it('refuses Nox and Mevric channel ids', () => {
    expect(channelGuard('abc', { BUFFER_X_CHANNEL_ID: 'abc' }).ok).toBe(false);
    expect(channelGuard('6aea10f0e29c69a1714d0a21').ok).toBe(false);
    expect(channelGuard('pop-only-channel').ok).toBe(true);
  });

  it('keeps publish off unless dedicated env is complete', () => {
    expect(publishGate({ POPCULTURE_PUBLISH_ENABLED: 'true', POPCULTURE_DRY_RUN: 'false', POPCULTURE_BUFFER_ACCESS_TOKEN: 'tok' }).ok).toBe(false);
    expect(publishGate({
      POPCULTURE_PUBLISH_ENABLED: 'true',
      POPCULTURE_DRY_RUN: 'false',
      POPCULTURE_BUFFER_ACCESS_TOKEN: 'tok',
      POPCULTURE_BUFFER_X_CHANNEL_ID: 'pop-channel',
    }).ok).toBe(true);
  });

  it('defaults to a separate sqlite file', () => {
    expect(popConfig({}).databasePath).toBe('./data/popculture.db');
  });
});

describe('video policy: native files only', () => {
  it('classifies youtube, hls, and mp4', () => {
    expect(classifyVideoReference('https://www.youtube.com/watch?v=abc')).toBe('youtube-page');
    expect(classifyVideoReference('https://cdn.jwplayer.com/manifests/fagviODW.m3u8', 'application/x-mpegURL')).toBe('hls-playlist');
    expect(classifyVideoReference('https://cdn.jwplayer.com/videos/fagviODW-iHvhYJ89.mp4', 'video/mp4')).toBe('direct-file');
  });

  it('requires resolution for youtube and HLS', () => {
    expect(assessVideo({ url: 'https://www.youtube.com/watch?v=nppid9XVtwY', }).attach).toBe(false);
    expect(assessVideo({ url: 'https://cdn.jwplayer.com/manifests/fagviODW.m3u8', mime: 'application/x-mpegURL' }).attach).toBe(false);
    expect(assessVideo({ url: 'https://cdn.jwplayer.com/videos/x.mp4', mime: 'video/mp4', bytes: 1, durationSeconds: 90 }).attach).toBe(true);
  });

  it('still refuses loopback URLs', () => {
    expect(assessVideo({ url: 'https://127.0.0.1/clip.mp4' }).attach).toBe(false);
  });

  it('prefers a 720p JW mp4', () => {
    const picked = pickJwMp4([
      { type: 'application/vnd.apple.mpegurl', file: 'https://cdn.jwplayer.com/manifests/x.m3u8' },
      { type: 'video/mp4', file: 'https://cdn.jwplayer.com/videos/x-1080.mp4', width: 1920, filesize: 27_000_000 },
      { type: 'video/mp4', file: 'https://cdn.jwplayer.com/videos/x-720.mp4', width: 1280, filesize: 16_000_000 },
    ]);
    expect(picked?.url).toContain('x-720.mp4');
  });
});

describe('parsing verified feed shapes', () => {
  const now = new Date('2026-11-20T18:00:00Z');

  it('keeps Moviefone trailer HLS and duration', () => {
    const items = parseSource(moviefone, JSON.stringify({
      items: [{
        id: 'https://www.moviefone.com/movie/killing-castro/z/videos/fagviODW/',
        url: 'https://www.moviefone.com/movie/killing-castro/z/videos/fagviODW/',
        title: "'Killing Castro' Trailer",
        summary: 'Official trailer for the political thriller.',
        date_published: '2026-11-19T17:26:12-05:00',
        attachments: [{ url: 'https://cdn.jwplayer.com/manifests/fagviODW.m3u8', mime_type: 'application/x-mpegURL', duration_in_seconds: 127 }],
      }],
    }), now);
    expect(items[0]?.status).toBe('rejected');
    expect(items[0]?.video.attach).toBe(false);
    expect(items[0]?.video.kind).toBe('hls-playlist');
    expect(items[0]?.video.durationSeconds).toBe(127);
  });

  it('keeps KinoCheck references for resolution without making them publishable', () => {
    const items = parseSource(kino, JSON.stringify({
      0: {
        id: 'ezbl', language: 'en', title: 'ICE AGE 6: Boiling Point Official Trailer (2027) Disney',
        url: 'https://kinocheck.com/trailer/ezbl/ice-age-6',
        youtube_video_id: 'nppid9XVtwY', published: '2026-11-19T18:13:37+01:00',
      },
      _metadata: { limit: 1 },
    }), now);
    expect(items[0]?.video.kind).toBe('youtube-page');
    expect(items[0]?.video.attach).toBe(false);
    expect(items[0]?.video.url).toContain('nppid9XVtwY');
  });

  it('parses Variety RSS without inventing a video', () => {
    const xml = `<?xml version="1.0"?><rss><channel><item>
      <title>HBO Lands Issa Rae Drama Open</title>
      <link>https://variety.com/2026/tv/news/issa-rae-open-hbo-123/</link>
      <pubDate>Fri, 20 Nov 2026 17:00:00 GMT</pubDate>
      <description>HBO has ordered the drama series.</description>
    </item></channel></rss>`;
    const items = parseSource(variety, xml, now);
    expect(items[0]?.postText).toContain('HBO Lands Issa Rae Drama Open');
    expect(items[0]?.video.attach).toBe(false);
    expect(items[0]?.status).toBe('rejected');
  });
});

describe('editorial and queue', () => {
  it('drops rumor and promo headlines', () => {
    expect(assessRelevance('Rumor: Marvel recasts Iron Man', '').ok).toBe(false);
    expect(assessRelevance('Where to stream the top 10 movies this weekend', '').ok).toBe(false);
    expect(assessRelevance('Taylor Swift announces 2027 stadium tour', 'The singer unveiled new dates.').ok).toBe(true);
  });

  it('formats posts with a topic hashtag and the Klieg brand hashtag', () => {
    const text = formatPost('Taylor Swift announces 2027 stadium tour', 'https://www.billboard.com/music/tour/', 'music');
    expect(text).toBe('Taylor Swift announces 2027 stadium tour\nhttps://www.billboard.com/music/tour/\n#Music #Klieg');
    expect(formatPost('A major new discovery by NASA', 'https://example.com/science', 'science')).toContain('#Science #Klieg');
    expect(formatPost('A dramatic rescue caught on camera', 'https://example.com/news', 'weather')).toContain('#Weather #Klieg');
    expect(formatPost('A new football final', 'https://example.com/sports', 'sport')).toContain('#Sports #Klieg');
  });

  it('keeps the original headline/URL and a Klieg hashtag without exceeding 280 chars', () => {
    const url='https://example.com/article';
    const base='a'.repeat(280 - (`\n${url}\n#Klieg`).length);
    const long=formatPost(base,url,'music');
    expect(long).toBe(`${base}\n${url}\n#Klieg`);
    expect(Array.from(long!).length).toBe(280);
    expect(formatPost(base+'a',url,'music')).toBeNull();
  });

  it('strips dash separators but keeps hyphenated words', () => {
    const text = formatPost('JLo Show Premiere — 186-Carat necklace - Variety', 'https://variety.com/story/');
    expect(text).toBe('JLo Show Premiere 186-Carat necklace Variety\nhttps://variety.com/story/\n#News #Klieg');
    expect(text).not.toMatch(/ — | – | - /);
  });

  it('detects near-duplicate events', () => {
    expect(titlesMatch('HBO Lands Issa Rae Drama Open', 'HBO lands Issa Rae drama Open')).toBe(true);
  });

  it('sends Buffer a video asset when a URL is present', () => {
    const payload = popPostPayload('hello', 'channel', 'https://cdn.jwplayer.com/videos/x.mp4');
    expect(payload.variables.assets[0]).toEqual({ video: { url: 'https://cdn.jwplayer.com/videos/x.mp4' } });
  });
});

describe('isolated sqlite queue', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pop-'));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('stores ready items with attached video separately from jobs.db', () => {
    const db = openPopDb(join(dir, 'popculture.db'));
    const item: DraftItem = {
      source: 'variety', externalId: 'abc', url: 'https://variety.com/2026/film/news/a/',
      title: 'A24 announces new film', summary: 'Studio announcement', publisher: 'Variety',
      category: 'film', publishedAt: '2026-11-20T12:00:00.000Z', score: 70, status: 'ready',
      rejection: null, postText: 'A24 announces new film\nhttps://variety.com/2026/film/news/a/',
      video: assessVideo({ url: 'https://cdn.example.com/clip.mp4', durationSeconds: 90 }),
    };
    upsertItem(db, item);
    const ready = listQueue(db, 'ready', 10);
    expect(ready).toHaveLength(1);
    expect(ready[0].video.attach).toBe(true);
    db.close();
  });
});


describe('video-only regression guards', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('refuses to build text-only or player-page Buffer payloads', () => {
    for (const url of [null, 'https://www.youtube.com/watch?v=abcdefghijk', 'https://cdn.example.com/v.m3u8', 'https://example.com/article']) {
      expect(() => popPostPayload('title', 'channel', url)).toThrow('native video file required');
    }
  });

  it('rejects files beyond duration and size limits', () => {
    expect(assessVideo({ url: 'https://cdn.example.com/v.mp4', durationSeconds: 141 }).attach).toBe(false);
    expect(assessVideo({ url: 'https://cdn.example.com/v.mp4', bytes: 513 * 1024 * 1024 }).attach).toBe(false);
  });

  it('chooses a video attachment even if an image comes first', () => {
    const items = parseSource(moviefone, JSON.stringify({ items: [{
      url: 'https://www.moviefone.com/clip/', title: 'New official movie trailer', date_published: '2026-11-20T17:00:00Z',
      attachments: [{url: 'https://cdn.example.com/image.jpg', mime_type: 'image/jpeg'}, {url: 'https://cdn.example.com/clip.mp4', mime_type: 'video/mp4'}],
    }] }), new Date('2026-11-20T18:00:00Z'));
    expect(items[0]?.status).toBe('ready');
    expect(items[0]?.video.url).toBe('https://cdn.example.com/clip.mp4');
  });

  it('blocks old ready rows with no video or stale YouTube attach flags before contacting Buffer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pop-legacy-'));
    try {
      vi.stubEnv('POPCULTURE_DATABASE_PATH', join(dir, 'pop.db'));
      vi.stubEnv('POPCULTURE_PUBLISH_ENABLED', 'true');
      vi.stubEnv('POPCULTURE_DRY_RUN', 'false');
      vi.stubEnv('POPCULTURE_BUFFER_ACCESS_TOKEN', 'test');
      vi.stubEnv('POPCULTURE_BUFFER_X_CHANNEL_ID', 'dedicated-test');
      const db = openPopDb();
      for (const [i, url] of [null, 'https://www.youtube.com/watch?v=abcdefghijk', 'https://cdn.example.com/a.m3u8'].entries()) {
        const video = assessVideo({ url });
        upsertItem(db, {source: 'test', externalId: String(i), url: `https://example.com/${i}`, title: ['Fresh cinema trailer released', 'Singer performs latest album live', 'Actor accepts golden award'][i], summary: '', publisher: 'Test', category: 'trailer', publishedAt: '2026-11-20T17:00:00Z', score: 90, status: 'ready', rejection: null, postText: `Clip ${i}`, video: {...video, attach: true} });
      }
      const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
      await publishPop();
      expect(fetch).not.toHaveBeenCalled();
      expect(listQueue(db, 'ready')).toHaveLength(0);
      expect(listQueue(db, 'rejected')).toHaveLength(3);
      db.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('promotes a rejected reference once its native file becomes available', () => {
    const db = openPopDb(':memory:');
    const item: DraftItem = { source: 'test', externalId: 'a', url: 'https://example.com/trailer', title: 'New film trailer', summary: '', publisher: 'Test', category: 'trailer', publishedAt: '2026-11-20T17:00:00Z', score: 90, status: 'rejected', rejection: 'native video file required', postText: 'New film trailer', video: assessVideo({url:'https://www.youtube.com/watch?v=abcdefghijk'}) };
    upsertItem(db, item);
    upsertItem(db, {...item, status: 'ready', rejection: null, video: assessVideo({url:'https://cdn.example.com/a.mp4',durationSeconds:90})});
    expect(listQueue(db, 'ready')).toHaveLength(1);
    db.close();
  });
});
