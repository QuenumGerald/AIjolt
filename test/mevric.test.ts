import { describe, expect, it } from 'vitest';
import { parseFeed, formatPost } from '../src/mevric.js';

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
  const previous = { path: process.env.MEVRIC_DATABASE_PATH, token: process.env.BUFFER_ACCESS_TOKEN, channel: process.env.MEVRIC_BUFFER_CHANNEL_ID };
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: { createPost: { post: { id: 'post-1' } } } }), { status: 200 }));
  try {
    process.env.MEVRIC_DATABASE_PATH = join(dir, 'test.db');
    process.env.BUFFER_ACCESS_TOKEN = 'test';
    process.env.MEVRIC_BUFFER_CHANNEL_ID = 'test-channel';
    await publish(false); // initializes database
    const db = new Database(process.env.MEVRIC_DATABASE_PATH);
    db.prepare('INSERT INTO stories(url,title,publisher,published_at) VALUES(?,?,?,?)').run('https://npr.org/1', 'News', 'NPR', new Date().toISOString());
    db.close();
    await publish(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const textRequest = fetchMock.mock.calls[0][1] as RequestInit;
    const textPayload = JSON.parse(textRequest.body as string);
    expect(textPayload.variables.text).toContain('News');
    expect(textPayload.variables).not.toHaveProperty('assets');
    const db2 = new Database(process.env.MEVRIC_DATABASE_PATH);
    db2.prepare('INSERT INTO stories(url,title,publisher,published_at,media_url,media_kind) VALUES(?,?,?,?,?,?)').run('https://npr.org/2', 'Another story', 'NPR', new Date().toISOString(), 'https://media.npr.org/image.jpg', 'image');
    db2.close();
    await publish(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(request.body as string).variables.input.assets).toEqual([{ image: { url: 'https://media.npr.org/image.jpg' } }]);
    const db3 = new Database(process.env.MEVRIC_DATABASE_PATH);
    expect(db3.prepare("SELECT COUNT(*) AS count FROM stories WHERE status='queued'").get()).toEqual({ count: 2 });
    db3.close();
  } finally {
    fetchMock.mockRestore();
    for (const [key, value] of Object.entries({ MEVRIC_DATABASE_PATH: previous.path, BUFFER_ACCESS_TOKEN: previous.token, MEVRIC_BUFFER_CHANNEL_ID: previous.channel })) {
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
  const rss = `<rss><channel><item><title>US news</title><link>https://www.npr.org/2026/story</link><pubDate>${new Date().toUTCString()}</pubDate><enclosure url="https://media.npr.org/photo.jpg" type="image/jpeg"/></item></channel></rss>`;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(rss, { status: 200 }));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    process.env.MEVRIC_DATABASE_PATH = join(dir, 'test.db');
    await collect();
    await collect();
    const db = new Database(process.env.MEVRIC_DATABASE_PATH);
    expect(db.prepare('SELECT COUNT(*) AS count FROM stories').get()).toEqual({ count: 1 });
    db.close();
    await publish(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('image: https://media.npr.org/photo.jpg'));
    expect(fetchMock).toHaveBeenCalledTimes(6);
  } finally {
    log.mockRestore();
    fetchMock.mockRestore();
    if (previousPath === undefined) delete process.env.MEVRIC_DATABASE_PATH; else process.env.MEVRIC_DATABASE_PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
