import { describe, expect, it } from 'vitest';
import { parseFeed, formatPost, articleImage } from '../src/mevric.js';

describe('Mevric feed', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  it('accepts recent NPR articles and rejects old and foreign URLs', () => {
    const item = (title: string, link: string, date: string) => `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate></item>`;
    const xml = `<rss><channel>${item('Election &amp; economy', 'https://www.npr.org/story/1', 'Mon, 02 Nov 2026 11:00:00 GMT')}${item('Old', 'https://www.npr.org/story/2', 'Fri, 30 Oct 2026 11:00:00 GMT')}${item('Wrong source', 'https://npr.org.evil.example/1', 'Mon, 02 Nov 2026 11:00:00 GMT')}</channel></rss>`;
    const stories = parseFeed(xml, now);
    expect(stories).toHaveLength(1);
    expect(stories[0].title).toBe('Election & economy');
    expect(formatPost(stories[0])).toContain('Source: NPR\nhttps://www.npr.org/story/1');
  });
  it('rejects overlong posts instead of truncating facts', () => {
    expect(formatPost({ title: 'a'.repeat(300), url: 'https://npr.org/1', publishedAt: new Date().toISOString(), publisher: 'NPR' })).toBeNull();
  });
  it('adds relevant hashtags and uses a generic tag for other headlines', () => {
    const story = { title: 'Congress debates new economic plan', url: 'https://npr.org/1', publishedAt: new Date().toISOString(), publisher: 'NPR' };
    expect(formatPost(story)).toContain('#Politics');
    expect(formatPost({ ...story, title: 'A story from the capital' })).toContain('#News');
  });
  it('keeps a fitting headline when there is no room for a hashtag', () => {
    const story = { title: 'a'.repeat(243), url: 'https://npr.org/1', publishedAt: new Date().toISOString(), publisher: 'NPR' };
    const result = formatPost(story);
    expect(result).not.toBeNull();
    expect(result).not.toContain('#News');
    expect(Array.from(result!).length).toBeLessThanOrEqual(280);
  });
});

it('extracts only trusted image or video enclosures', () => {
  const wrap = (tag: string) => `<rss><item><title>News</title><link>https://npr.org/story</link><pubDate>Mon, 02 Nov 2026 11:00:00 GMT</pubDate>${tag}</item></rss>`;
  const now = Date.parse('2026-11-02T12:00:00Z');
  expect(parseFeed(wrap('<media:content url="https://media.npr.org/image.jpg" medium="image"/>'), now)[0].media).toEqual({ kind: 'image', url: 'https://media.npr.org/image.jpg' });
  expect(parseFeed(wrap('<enclosure url="https://media.npr.org/clip.mp4" type="video/mp4"/>'), now)[0].media?.kind).toBe('video');
  expect(parseFeed(wrap('<enclosure url="https://evil.example/photo.jpg" type="image/jpeg"/>'), now)[0].media).toBeUndefined();
});

it('sends a text-only post when no media is available and attaches an available image to Buffer', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: Database } = await import('better-sqlite3');
  const { vi } = await import('vitest');
  const { publish } = await import('../src/mevric.js');
  const dir = mkdtempSync(join(tmpdir(), 'mevric-test-'));
  const previous = { path: process.env.MEVRIC_DATABASE_PATH, token: process.env.BUFFER_ACCESS_TOKEN, channel: process.env.MEVRIC_BUFFER_CHANNEL_ID, ai: process.env.DEEPSEEK_API_KEY };
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => new Response(JSON.stringify(String(url).includes('deepseek.com') ? { choices: [{ message: { content: 'A rewritten news update.' } }] } : { data: { createPost: { post: { id: 'post-1' } } } }), { status: 200 }));
  try {
    process.env.MEVRIC_DATABASE_PATH = join(dir, 'test.db');
    process.env.BUFFER_ACCESS_TOKEN = 'test';
    process.env.MEVRIC_BUFFER_CHANNEL_ID = 'test-channel';
    process.env.DEEPSEEK_API_KEY = 'test';
    await publish(false); // initializes database
    const db = new Database(process.env.MEVRIC_DATABASE_PATH);
    db.prepare('INSERT INTO stories(url,title,publisher,published_at) VALUES(?,?,?,?)').run('https://npr.org/1', 'News', 'NPR', new Date().toISOString());
    db.close();
    await publish(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const textRequest = fetchMock.mock.calls[1][1] as RequestInit;
    const textPayload = JSON.parse(textRequest.body as string);
    expect(textPayload.variables.text).toContain('A rewritten news update.');
    expect(textPayload.variables).not.toHaveProperty('assets');
    const db2 = new Database(process.env.MEVRIC_DATABASE_PATH);
    db2.prepare('INSERT INTO stories(url,title,publisher,published_at,media_url,media_kind) VALUES(?,?,?,?,?,?)').run('https://npr.org/2', 'Another story', 'NPR', new Date().toISOString(), 'https://media.npr.org/image.jpg', 'image');
    db2.close();
    await publish(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const request = fetchMock.mock.calls[3][1] as RequestInit;
    expect(JSON.parse(request.body as string).variables.input.assets).toEqual([{ image: { url: 'https://media.npr.org/image.jpg' } }]);
    const db3 = new Database(process.env.MEVRIC_DATABASE_PATH);
    expect(db3.prepare("SELECT COUNT(*) AS count FROM stories WHERE status='queued'").get()).toEqual({ count: 2 });
    db3.close();
  } finally {
    fetchMock.mockRestore();
    for (const [key, value] of Object.entries({ MEVRIC_DATABASE_PATH: previous.path, BUFFER_ACCESS_TOKEN: previous.token, MEVRIC_BUFFER_CHANNEL_ID: previous.channel, DEEPSEEK_API_KEY: previous.ai })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

it('collects the same RSS item once across feeds and repeat runs, then previews it', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: Database } = await import('better-sqlite3');
  const { vi } = await import('vitest');
  const { collect, publish } = await import('../src/mevric.js');
  const dir = mkdtempSync(join(tmpdir(), 'mevric-collect-'));
  const previousPath = process.env.MEVRIC_DATABASE_PATH;
  const previousKey = process.env.DEEPSEEK_API_KEY;
  const rss = `<rss><channel><item><title>US news</title><link>https://www.npr.org/2026/story</link><pubDate>${new Date().toUTCString()}</pubDate><enclosure url="https://media.npr.org/photo.jpg" type="image/jpeg"/></item></channel></rss>`;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url).includes('deepseek.com') ? new Response(JSON.stringify({ choices: [{ message: { content: 'A US news update.' } }] }), { status: 200 }) : new Response(rss, { status: 200 }));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    process.env.MEVRIC_DATABASE_PATH = join(dir, 'test.db');
    process.env.DEEPSEEK_API_KEY = 'test';
    await collect();
    await collect();
    const db = new Database(process.env.MEVRIC_DATABASE_PATH);
    expect(db.prepare('SELECT COUNT(*) AS count FROM stories').get()).toEqual({ count: 1 });
    db.close();
    await publish(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('image: https://media.npr.org/photo.jpg'));
    expect(fetchMock).toHaveBeenCalledTimes(7);
  } finally {
    log.mockRestore();
    fetchMock.mockRestore();
    if (previousPath === undefined) delete process.env.MEVRIC_DATABASE_PATH; else process.env.MEVRIC_DATABASE_PATH = previousPath;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
    rmSync(dir, { recursive: true, force: true });
  }
});

it('does not publish when the rewriting service fails', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: Database } = await import('better-sqlite3');
  const { vi } = await import('vitest');
  const { publish } = await import('../src/mevric.js');
  const dir = mkdtempSync(join(tmpdir(), 'mevric-failure-'));
  const oldPath = process.env.MEVRIC_DATABASE_PATH;
  const oldKey = process.env.DEEPSEEK_API_KEY;
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('error', { status: 500 }));
  try {
    process.env.MEVRIC_DATABASE_PATH = join(dir, 'test.db');
    process.env.DEEPSEEK_API_KEY = 'test';
    await publish(true);
    const db = new Database(process.env.MEVRIC_DATABASE_PATH);
    db.prepare('INSERT INTO stories(url,title,publisher,published_at) VALUES(?,?,?,?)').run('https://npr.org/1', 'News', 'NPR', new Date().toISOString());
    db.close();
    await expect(publish(false)).rejects.toThrow('DeepSeek HTTP 500');
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][0])).toContain('api.deepseek.com');
    const check = new Database(process.env.MEVRIC_DATABASE_PATH);
    expect(check.prepare('SELECT status FROM stories').get()).toEqual({ status: 'new' });
    check.close();
  } finally {
    request.mockRestore();
    if (oldPath === undefined) delete process.env.MEVRIC_DATABASE_PATH; else process.env.MEVRIC_DATABASE_PATH = oldPath;
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
    rmSync(dir, { recursive: true, force: true });
  }
});


describe('Mevric article image fallback', () => {
  it('extracts a trusted NPR og:image even when HTML attributes are reversed', () => {
    expect(articleImage(`<meta content="https://npr.brightspotcdn.com/img.jpg?size=1400&amp;quality=85" property="og:image">`))
      .toEqual({ kind: 'image', url: 'https://npr.brightspotcdn.com/img.jpg?size=1400&quality=85' });
    expect(articleImage(`<meta name='twitter:image:src' content='https://media.npr.org/picture.jpg'>`))
      .toEqual({ kind: 'image', url: 'https://media.npr.org/picture.jpg' });
  });
  it('rejects external or non-HTTPS image origins and skips unsafe first matches', () => {
    const html = `<meta property="og:image" content="https://npr.org.evil.test/cover.jpg">
      <meta property="og:image" content="http://media.npr.org/insecure.jpg">
      <meta property="og:image" content="https://npr.brightspotcdn.com/valid.jpg">`;
    expect(articleImage(html)).toEqual({ kind: 'image', url: 'https://npr.brightspotcdn.com/valid.jpg' });
    expect(articleImage('<meta property="og:image" content="https://user:pass@www.npr.org/secret">')).toBeUndefined();
  });
  it('fetches article metadata only when RSS lacks media and persists it without duplicate articles', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { default: Database } = await import('better-sqlite3');
    const { vi } = await import('vitest');
    const { collect } = await import('../src/mevric.js');
    const dir = mkdtempSync(join(tmpdir(), 'mevric-image-'));
    const previousPath = process.env.MEVRIC_DATABASE_PATH;
    const article = 'https://www.npr.org/2026/story';
    const rss = `<rss><item><title>News</title><link>${article}</link><pubDate>${new Date().toUTCString()}</pubDate></item></rss>`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url) === article
      ? new Response('<html><meta property="og:image" content="https://npr.brightspotcdn.com/cover.jpg"></html>', { headers: { 'content-type': 'text/html' } })
      : new Response(rss, { headers: { 'content-type': 'application/rss+xml' } }));
    try {
      process.env.MEVRIC_DATABASE_PATH = join(dir, 'test.db');
      await collect();
      await collect();
      const db = new Database(process.env.MEVRIC_DATABASE_PATH);
      expect(db.prepare('SELECT count(*) as count FROM stories').get()).toEqual({ count: 1 });
      expect(db.prepare('SELECT media_url,media_kind FROM stories').get())
        .toEqual({ media_url: 'https://npr.brightspotcdn.com/cover.jpg', media_kind: 'image' });
      db.close();
      const articleRequests = fetchMock.mock.calls.filter(call => String(call[0]) === article);
      expect(articleRequests).toHaveLength(1); // cached in SQLite on the second run
      expect((articleRequests[0][1] as RequestInit).redirect).toBe('manual');
    } finally {
      fetchMock.mockRestore();
      if (previousPath === undefined) delete process.env.MEVRIC_DATABASE_PATH; else process.env.MEVRIC_DATABASE_PATH = previousPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('ignores a redirect to an untrusted domain and still collects the article', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { default: Database } = await import('better-sqlite3');
    const { vi } = await import('vitest');
    const { collect } = await import('../src/mevric.js');
    const dir = mkdtempSync(join(tmpdir(), 'mevric-redirect-'));
    const previousPath = process.env.MEVRIC_DATABASE_PATH;
    const article = 'https://www.npr.org/2026/story';
    const rss = `<rss><item><title>News</title><link>${article}</link><pubDate>${new Date().toUTCString()}</pubDate></item></rss>`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url) === article
      ? new Response(null, { status: 302, headers: { location: 'https://evil.example/private', 'content-type': 'text/html' } })
      : new Response(rss, { headers: { 'content-type': 'application/rss+xml' } }));
    try {
      process.env.MEVRIC_DATABASE_PATH = join(dir, 'test.db');
      await collect();
      const db = new Database(process.env.MEVRIC_DATABASE_PATH);
      expect(db.prepare('SELECT media_url FROM stories').get()).toEqual({ media_url: null });
      db.close();
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes('evil.example'))).toBe(false);
    } finally {
      fetchMock.mockRestore();
      if (previousPath === undefined) delete process.env.MEVRIC_DATABASE_PATH; else process.env.MEVRIC_DATABASE_PATH = previousPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
