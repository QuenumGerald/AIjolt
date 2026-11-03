import { describe, expect, it } from 'vitest';
import { parseFeed, formatPost, articleImage, postHeading } from '../src/mevric.js';

describe('Mevric feed', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  it('accepts recent NPR articles and rejects old and foreign URLs', () => {
    const item = (title: string, link: string, date: string) => `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate></item>`;
    const xml = `<rss><channel>${item('Election &amp; economy', 'https://www.npr.org/story/1', 'Mon, 02 Nov 2026 11:00:00 GMT')}${item('Old', 'https://www.npr.org/story/2', 'Fri, 30 Oct 2026 11:00:00 GMT')}${item('Wrong source', 'https://npr.org.evil.example/1', 'Mon, 02 Nov 2026 11:00:00 GMT')}</channel></rss>`;
    const stories = parseFeed(xml, now);
    expect(stories).toHaveLength(1);
    expect(stories[0].title).toBe('Election & economy');
    expect(formatPost(stories[0])).toContain('POLITICS 🏛️');
    expect(formatPost(stories[0])).not.toContain('Source: NPR');
    expect(formatPost(stories[0])).toContain(stories[0].url);
  });
  it('parses BBC and ABC News RSS while blocking spoofed domains and tracking params', () => {
    const now = Date.parse('2026-11-03T20:00:00Z');
    const item = (url: string) => `<rss><item><title>World news</title><link>${url.replace(/&/g, '&amp;')}</link><pubDate>Tue, 03 Nov 2026 19:30:00 GMT</pubDate></item></rss>`;
    const bbc = parseFeed(item('https://www.bbc.co.uk/news/articles/test?at_medium=RSS&at_campaign=rss'), now, 'BBC');
    expect(bbc).toHaveLength(1);
    expect(bbc[0].publisher).toBe('BBC');
    expect(bbc[0].url).toBe('https://www.bbc.co.uk/news/articles/test');
    const abc = parseFeed(item('https://abcnews.com/US/story?id=123456'), now, 'ABC News');
    expect(abc).toHaveLength(1);
    expect(abc[0].publisher).toBe('ABC News');
    expect(abc[0].url).toContain('abcnews.com/US/story');
    expect(parseFeed(item('https://www.bbc.co.uk.evil.test/article'),now,'BBC')).toHaveLength(0);
    expect(parseFeed(item('https://abcnews.go.com.evil.test/article'),now,'ABC News')).toHaveLength(0);
    expect(parseFeed(item('https://www.aljazeera.com/news/example'),now,'Al Jazeera')).toHaveLength(0);
    expect(parseFeed(item('http://www.bbc.co.uk/news/example'),now,'BBC')).toHaveLength(0);
  });
  it('makes topic-led hooks varied and reserves BREAKING for explicit urgent headlines', () => {
    const base = { url:'https://www.npr.org/example', publishedAt:new Date().toISOString(), publisher:'NPR' };
    expect(postHeading({ ...base, title:'Breaking: Senate announces election result' })).toBe('BREAKING 🚨');
    expect(postHeading({ ...base, title:'Developing story: search underway near coast' })).toBe('DEVELOPING 🔴');
    expect(postHeading({ ...base, title:'Senate debates election bill' })).toContain('POLITICS 🏛️');
    expect(postHeading({ ...base, title:'NBA playoffs begin tonight' })).toContain('SPORTS 🏆');
    expect(postHeading({ ...base, title:'Federal Reserve signals interest rates' })).toContain('ECONOMY 📈');
    expect(postHeading({ ...base, title:'NASA launches spacecraft' })).toContain('SCIENCE 🔬');
    expect(postHeading({ ...base, title:'Local community celebrates annual festival' })).toContain('NEWS 📰');
    expect(postHeading({ ...base, title:'Senate debates election bill' })).not.toContain('BREAKING');
    const headings = new Set(Array.from({length:12},(_,i)=>postHeading({ ...base,title:'New city project opens',url:`https://www.npr.org/article-${i}` })));
    expect(headings.size).toBeGreaterThan(1);
    expect(formatPost({ ...base, title:'NASA launches spacecraft' })).toContain('SCIENCE 🔬');
  });
  it('keeps article links even when no media is available', () => {
    const story = { title: 'News event', url: 'https://www.npr.org/story/1', publishedAt: new Date().toISOString(), publisher: 'NPR' };
    const text = formatPost(story);
    expect(text).toContain('News event');
    expect(text).toContain('NEWS 📰');
    expect(text).not.toContain('Source: NPR');
    expect(text).toContain(story.url);
  });
  it('varies rewrite length targets across stories and respects room for the article link', async () => {
    const { rewriteTarget } = await import('../src/mevric.js');
    const base = {title: 'News update', publisher: 'NPR', publishedAt: new Date().toISOString()};
    const a = rewriteTarget({...base, url:'https://www.npr.org/2026/story/alpha'});
    const b = rewriteTarget({...base, url:'https://www.npr.org/2026/story/beta'});
    expect(a.target).not.toBe(b.target);
    expect(a.target).toBeLessThanOrEqual(a.max);
    expect(b.target).toBeLessThanOrEqual(b.max);
    const long = rewriteTarget({...base, url:'https://www.npr.org/2026/story/this-is-a-very-long-news-article-address-with-many-characters'});
    expect(long.max).toBeLessThan(a.max);
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
    const base = { title: 'a', url: 'https://npr.org/1', publishedAt: new Date().toISOString(), publisher: 'NPR' };
    const overhead = Array.from(`${postHeading(base)}\n\n\n\n${base.url}`).length;
    const story = { ...base, title: 'a'.repeat(280 - overhead) };
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
  expect(parseFeed(wrap('<media:thumbnail url="https://media.npr.org/cover.jpg"/><enclosure url="https://media.npr.org/clip.mp4" type="video/mp4"/>'), now)[0].media)
    .toEqual({ kind: 'video', url: 'https://media.npr.org/clip.mp4' });
});

it('sends a text-only post when no media is available and attaches an available image to Buffer', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: Database } = await import('better-sqlite3');
  const { vi } = await import('vitest');
  const { publish } = await import('../src/mevric.js');
  const dir = mkdtempSync(join(tmpdir(), 'mevric-test-'));
  const previous = { path: process.env.MEVRIC_DATABASE_PATH, token: process.env.BUFFER_ACCESS_TOKEN, channel: process.env.MEVRIC_BUFFER_CHANNEL_ID, ai: process.env.DEEPSEEK_API_KEY, media: process.env.MEVRIC_MEDIA_APPROVED };
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
    expect(textPayload.variables.input.text).toContain('A rewritten news update.');
    expect(textPayload.variables.input.text).toContain('https://npr.org/1');
    expect(textPayload.variables.input.text).not.toContain('Source: NPR');
    expect(textPayload.variables.input.mode).toBe('shareNow');
    expect(textPayload.variables.input.assets).toEqual([]);
    expect(textPayload.variables.input.needsApproval).toBe(false);
    const db2 = new Database(process.env.MEVRIC_DATABASE_PATH);
    db2.prepare('INSERT INTO stories(url,title,publisher,published_at,media_url,media_kind) VALUES(?,?,?,?,?,?)').run('https://npr.org/2', 'Another story', 'NPR', new Date().toISOString(), 'https://media.npr.org/image.jpg', 'image');
    db2.close();
    process.env.MEVRIC_MEDIA_APPROVED = 'true'; // test only: simulate an approved image
    await publish(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const request = fetchMock.mock.calls[3][1] as RequestInit;
    expect(JSON.parse(request.body as string).variables.input.assets).toEqual([{ image: { url: 'https://media.npr.org/image.jpg' } }]);
    expect(JSON.parse(request.body as string).variables.input.text).toContain('https://npr.org/2');
    const db3 = new Database(process.env.MEVRIC_DATABASE_PATH);
    expect(db3.prepare("SELECT COUNT(*) AS count FROM stories WHERE status='queued'").get()).toEqual({ count: 2 });
    db3.close();
  } finally {
    fetchMock.mockRestore();
    for (const [key, value] of Object.entries({ MEVRIC_DATABASE_PATH: previous.path, BUFFER_ACCESS_TOKEN: previous.token, MEVRIC_BUFFER_CHANNEL_ID: previous.channel, DEEPSEEK_API_KEY: previous.ai, MEVRIC_MEDIA_APPROVED: previous.media })) {
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
    expect(log).toHaveBeenCalledWith(expect.stringContaining('NEWS 📰'));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('image: https://media.npr.org/photo.jpg'));
    expect(fetchMock).toHaveBeenCalledTimes(17);
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
  it('rejects historical FILE photo thumbnails even when og:image exists', () => {
    const html = `<meta property="og:image" content="https://npr.brightspotcdn.com/cover.jpg"><img src="/cover.jpg" fetchpriority="high" alt="FILE - Fishermen stand on the beach in Somalia, March 6, 2017.">`;
    expect(articleImage(html)).toBeUndefined();
  });
  it('accepts image thumbnails with an ordinary descriptive caption', () => {
    const html = `<meta property="og:image" content="https://npr.brightspotcdn.com/cover.jpg"><img fetchpriority="high" alt="Rescue teams at the scene today">`;
    expect(articleImage(html)?.kind).toBe('image');
  });

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
