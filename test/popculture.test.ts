import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { channelGuard, popConfig, publishGate } from '../src/popculture/config.js';
import { parseSource } from '../src/popculture/parse.js';
import { formatPost } from '../src/popculture/posts.js';
import { popPostPayload } from '../src/popculture/publish.js';
import { assessRelevance, titlesMatch } from '../src/popculture/relevance.js';
import { openPopDb, upsertItem, listQueue } from '../src/popculture/store.js';
import { assessVideo, classifyVideoReference, pickJwMp4 } from '../src/popculture/video.js';
import type { DraftItem, PopSource } from '../src/popculture/types.js';

const moviefone: PopSource = { id: 'moviefone-trailers', publisher: 'Moviefone', url: 'https://www.moviefone.com/feeds/trailers.json', kind: 'json-feed', videoRights: 'unconfirmed', defaultCategory: 'trailer' };
const kino: PopSource = { id: 'kinocheck', publisher: 'KinoCheck', url: 'https://api.kinocheck.com/trailers/latest', kind: 'kinocheck', videoRights: 'unconfirmed', defaultCategory: 'trailer' };
const variety: PopSource = { id: 'variety', publisher: 'Variety', url: 'https://variety.com/feed/', kind: 'rss', videoRights: 'unconfirmed' };

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

describe('video policy: accept every public HTTPS video', () => {
  it('classifies youtube, hls, and mp4', () => {
    expect(classifyVideoReference('https://www.youtube.com/watch?v=abc')).toBe('youtube-page');
    expect(classifyVideoReference('https://cdn.jwplayer.com/manifests/fagviODW.m3u8', 'application/x-mpegURL')).toBe('hls-playlist');
    expect(classifyVideoReference('https://cdn.jwplayer.com/videos/fagviODW-iHvhYJ89.mp4', 'video/mp4')).toBe('direct-file');
  });

  it('attaches youtube and hls without a rights gate', () => {
    expect(assessVideo({ url: 'https://www.youtube.com/watch?v=nppid9XVtwY', rights: 'unconfirmed' }).attach).toBe(true);
    expect(assessVideo({ url: 'https://cdn.jwplayer.com/manifests/fagviODW.m3u8', mime: 'application/x-mpegURL' }).attach).toBe(true);
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
    expect(items[0]?.status).toBe('ready');
    expect(items[0]?.video.attach).toBe(true);
    expect(items[0]?.video.kind).toBe('hls-playlist');
    expect(items[0]?.video.durationSeconds).toBe(127);
  });

  it('keeps KinoCheck youtube ids as attachable videos', () => {
    const items = parseSource(kino, JSON.stringify({
      0: {
        id: 'ezbl', language: 'en', title: 'ICE AGE 6: Boiling Point Official Trailer (2027) Disney',
        url: 'https://kinocheck.com/trailer/ezbl/ice-age-6',
        youtube_video_id: 'nppid9XVtwY', published: '2026-11-19T18:13:37+01:00',
      },
      _metadata: { limit: 1 },
    }), now);
    expect(items[0]?.video.kind).toBe('youtube-page');
    expect(items[0]?.video.attach).toBe(true);
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
  });
});

describe('editorial and queue', () => {
  it('drops rumor and promo headlines', () => {
    expect(assessRelevance('Rumor: Marvel recasts Iron Man', '').ok).toBe(false);
    expect(assessRelevance('Where to stream the top 10 movies this weekend', '').ok).toBe(false);
    expect(assessRelevance('Taylor Swift announces 2027 stadium tour', 'The singer unveiled new dates.').ok).toBe(true);
  });

  it('formats posts as title plus source URL', () => {
    const text = formatPost('Taylor Swift announces 2027 stadium tour', 'https://www.billboard.com/music/tour/');
    expect(text).toBe('Taylor Swift announces 2027 stadium tour\nhttps://www.billboard.com/music/tour/');
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
      video: assessVideo({ url: 'https://www.youtube.com/watch?v=zzzz' }),
    };
    upsertItem(db, item);
    const ready = listQueue(db, 'ready', 10);
    expect(ready).toHaveLength(1);
    expect(ready[0].video.attach).toBe(true);
    db.close();
  });
});
