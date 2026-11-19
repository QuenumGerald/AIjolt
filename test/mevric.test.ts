import { describe, expect, it } from 'vitest';
import { parseFeed, formatPost, articleImage, postHeading, cleanNewsRewrite } from '../src/mevric.js';

describe('Mevric feed', () => {
  const now = Date.parse('2026-11-02T12:00:00Z');
  it('accepts recent NPR articles and rejects old and foreign URLs', () => {
    const item = (title: string, link: string, date: string) => `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate></item>`;
    const xml = `<rss><channel>${item('Election &amp; economy', 'https://www.npr.org/story/1', 'Mon, 02 Nov 2026 11:00:00 GMT')}${item('Old', 'https://www.npr.org/story/2', 'Fri, 30 Oct 2026 11:00:00 GMT')}${item('Wrong source', 'https://npr.org.evil.example/1', 'Mon, 02 Nov 2026 11:00:00 GMT')}</channel></rss>`;
    const stories = parseFeed(xml, now);
    expect(stories).toHaveLength(1);
    expect(stories[0].title).toBe('Election & economy');
    expect(formatPost(stories[0])).toBe(`Election & economy\nhttps://www.npr.org/story/1\n#News`);
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
    expect(parseFeed(item('https://www.foxnews.com/us/active-shooter-tampa'),now,'Fox News')).toMatchObject([{ publisher: 'Fox News' }]);
    expect(parseFeed(item('https://www.cbsnews.com/news/major-explosion/'),now,'CBS News')).toMatchObject([{ publisher: 'CBS News' }]);
    expect(parseFeed(item('https://www.foxnews.com.evil.test/us/active-shooter-tampa'),now,'Fox News')).toHaveLength(0);
    expect(parseFeed(item('https://www.cbsnews.com.evil.test/news/example'),now,'CBS News')).toHaveLength(0);
    expect(parseFeed(item('https://www.aljazeera.com/news/shooting'),now,'Al Jazeera')).toHaveLength(0);
  });
  it('prints ordinary news as the exact RSS headline + full link + #News, without ALERT', () => {
    const base = { url:'https://www.npr.org/example', publishedAt:new Date().toISOString(), publisher:'NPR' };
    const title='Senate debates election bill – officials confirm details';
    expect(postHeading({ ...base, title })).toBe('');
    expect(formatPost({ ...base,title })).toBe(`${title}\n${base.url}\n#News`);
    expect(formatPost({ ...base,title })).not.toContain('ALERT');
    expect(formatPost({ ...base,title })).not.toContain('BREAKING');
  });
  it('uses the ALERT prefix only with an explicit alert classification', () => {
    const base={url:'https://www.foxnews.com/us/active-shooter-tampa',publisher:'Fox News',publishedAt:new Date().toISOString(),title:'Active shooter at Tampa, Florida bank building'};
    expect(postHeading(base)).toBe('ALERT 🚨');
    expect(formatPost(base,base.title,true)).toBe(`ALERT 🚨\n${base.title}\n${base.url}\n#News`);
    expect(formatPost(base)).toBe(`${base.title}\n${base.url}\n#News`);
  });
  it('keeps article links even when no media is available', () => {
    const story = { title: 'News event', url: 'https://www.npr.org/story/1', publishedAt: new Date().toISOString(), publisher: 'NPR' };
    const text = formatPost(story);
    expect(text).toContain('News event');
    expect(text).toContain('#News');
    expect(text).not.toContain('Source: NPR');
    expect(text).toContain(story.url);
  });
  it('removes BBC/ABC/NPR newswire credits but preserves event-specific attribution', () => {
    const story = {title:'UK-EU draft deal',publisher:'BBC',url:'https://www.bbc.co.uk/news/story',publishedAt:new Date().toISOString()};
    expect(cleanNewsRewrite('The UK and EU agreed a draft deal, the BBC reports.',story,180))
      .toBe('The UK and EU agreed a draft deal.');
    expect(cleanNewsRewrite('The UK and EU agreed a draft deal, the BBC reported.',story,180))
      .toBe('The UK and EU agreed a draft deal.');
    expect(cleanNewsRewrite('BBC reports that the UK and EU agreed a draft deal.',story,180))
      .toBe('The UK and EU agreed a draft deal.');
    expect(cleanNewsRewrite('According to ABC News, new legislation was approved.',{...story,publisher:'ABC News'},180))
      .toBe('New legislation was approved.');
    expect(cleanNewsRewrite('A rescue operation is underway, NPR says.',{...story,publisher:'NPR'},180))
      .toBe('A rescue operation is underway.');
    expect(cleanNewsRewrite('The BBC says officials are investigating, BBC adds.',story,180)).toBeNull();
    expect(cleanNewsRewrite('Two people were injured, Fox News reports.',{...story,publisher:'Fox News'},180)).toBe('Two people were injured.');
    expect(cleanNewsRewrite('According to CBS News, the suspect was taken into custody.',{...story,publisher:'CBS News'},180)).toBe('The suspect was taken into custody.');
    expect(cleanNewsRewrite('Russian bombing killed 31 people at an aid centre, Kyiv says.',story,180))
      .toBe('Russian bombing killed 31 people at an aid centre, Kyiv says.');
    expect(cleanNewsRewrite('BBC sources say there is a war.',story,180)).toBeNull();
  });
  it('sends no publisher in the DeepSeek prompt and defaults to V4 Pro', async () => {
    const { vi } = await import('vitest');
    const { rewriteHeadline } = await import('../src/mevric.js');
    const previous = {api:process.env.DEEPSEEK_API_KEY,model:process.env.DEEPSEEK_MODEL};
    process.env.DEEPSEEK_API_KEY = 'test-key';
    delete process.env.DEEPSEEK_MODEL;
    const mock = vi.spyOn(globalThis,'fetch').mockImplementation(async () => new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'Workers may be reducing extra effort at work, potentially affecting the economy, the BBC reports.'}}]}),{status:200}));
    try {
      const story={ title:'Quiet quitting could hit the economy',url:'https://www.bbc.co.uk/news/test',publisher:'BBC',publishedAt:new Date().toISOString() };
      expect(await rewriteHeadline(story)).toBe('Workers may be reducing extra effort at work, potentially affecting the economy.');
      const payload=JSON.parse((mock.mock.calls[0][1] as RequestInit).body as string);
      expect(payload.model).toBe('deepseek-v4-pro');
      expect(payload.max_tokens).toBeGreaterThan(500);
      expect(payload.messages[1].content).not.toContain('publisher');
      expect(payload.messages[1].content).not.toContain('BBC');
    } finally {
      mock.mockRestore();
      if(previous.api===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous.api;
      if(previous.model===undefined)delete process.env.DEEPSEEK_MODEL;else process.env.DEEPSEEK_MODEL=previous.model;
    }
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
  it('uses exactly #News, without multiple topic hashtags', () => {
    const story = { title: 'Congress debates new economic plan', url: 'https://npr.org/1', publishedAt: new Date().toISOString(), publisher: 'NPR' };
    expect(formatPost(story)).toBe(`${story.title}\n${story.url}\n#News`);
  });
  it('never truncates or removes the #News hashtag to fit an overlong title', () => {
    const story = { title: 'a'.repeat(275), url: 'https://npr.org/1', publishedAt: new Date().toISOString(), publisher: 'NPR' };
    expect(formatPost(story)).toBeNull();
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

it('publishes the original headline and link through Buffer, preserving approved media without DeepSeek', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: Database } = await import('better-sqlite3');
  const { vi } = await import('vitest');
  const { publish } = await import('../src/mevric.js');
  const dir = mkdtempSync(join(tmpdir(),'mevric-publish-format-'));
  const previous = { path:process.env.MEVRIC_DATABASE_PATH,token:process.env.BUFFER_ACCESS_TOKEN,channel:process.env.MEVRIC_BUFFER_CHANNEL_ID,media:process.env.MEVRIC_MEDIA_APPROVED };
  const sent: Array<{text:string;assets:unknown[];mode:string;needsApproval:boolean}> = [];
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async (url,options) => {
    const address=String(url);
    if(address.includes('api.buffer.com')) {
      const body=JSON.parse(String(options?.body));sent.push(body.variables.input);
      return new Response(JSON.stringify({data:{createPost:{post:{id:`post-${sent.length}`}}}}),{status:200});
    }
    if(address.includes('api.deepseek.com')) throw Error('DeepSeek must never be called for exact-title posts');
    const title=address.endsWith('/1')?'US Congress debates the federal budget':'U.S. Senate votes on a new national security bill';
    return new Response(`<meta property="og:title" content="${title}">`,{status:200,headers:{'content-type':'text/html'}});
  });
  try {
    process.env.MEVRIC_DATABASE_PATH=join(dir,'test.db');
    process.env.BUFFER_ACCESS_TOKEN='test';
    process.env.MEVRIC_BUFFER_CHANNEL_ID='test-channel';
    await publish(false);
    const db=new Database(process.env.MEVRIC_DATABASE_PATH);
    db.prepare('INSERT INTO stories(url,title,publisher,published_at) VALUES(?,?,?,?)').run('https://npr.org/1','US Congress debates the federal budget','NPR',new Date().toISOString());
    db.close();
    await publish(false);
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe('US Congress debates the federal budget\nhttps://npr.org/1\n#News');
    expect(sent[0].mode).toBe('shareNow');
    expect(sent[0].assets).toEqual([]);
    expect(sent[0].needsApproval).toBe(false);
    const db2=new Database(process.env.MEVRIC_DATABASE_PATH);
    db2.prepare('INSERT INTO stories(url,title,publisher,published_at,media_url,media_kind) VALUES(?,?,?,?,?,?)').run('https://npr.org/2','U.S. Senate votes on a new national security bill','NPR',new Date().toISOString(),'https://media.npr.org/image.jpg','image');
    db2.prepare("UPDATE stories SET attempted_at=? WHERE status='queued'").run(new Date(Date.now()-31*60_000).toISOString());
    db2.close();
    process.env.MEVRIC_MEDIA_APPROVED='true';
    await publish(false);
    expect(sent).toHaveLength(2);
    expect(sent[1].assets).toEqual([{ image:{url:'https://media.npr.org/image.jpg'} }]);
    expect(sent[1].text).toBe('U.S. Senate votes on a new national security bill\nhttps://npr.org/2\n#News');
    const db3=new Database(process.env.MEVRIC_DATABASE_PATH);
    expect(db3.prepare("SELECT count(*) AS n FROM stories WHERE status='queued' AND post_kind='news'").get()).toEqual({n:2});
    db3.close();
    expect(fetchMock.mock.calls.every(c=>!String(c[0]).includes('deepseek.com'))).toBe(true);
  } finally {
    fetchMock.mockRestore();
    for(const [key,val] of Object.entries({ MEVRIC_DATABASE_PATH:previous.path,BUFFER_ACCESS_TOKEN:previous.token,MEVRIC_BUFFER_CHANNEL_ID:previous.channel,MEVRIC_MEDIA_APPROVED:previous.media })) {
      if(val===undefined) delete process.env[key];else process.env[key]=val;
    }
    rmSync(dir,{recursive:true,force:true});
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
  const rss = `<rss><channel><item><title>US Congress discusses the federal budget</title><link>https://www.npr.org/2026/story</link><pubDate>${new Date().toUTCString()}</pubDate><enclosure url="https://media.npr.org/photo.jpg" type="image/jpeg"/></item></channel></rss>`;
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
    expect(log).toHaveBeenCalledWith(expect.stringContaining('US Congress discusses the federal budget\nhttps://www.npr.org/2026/story\n#News'));
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('image: https://media.npr.org/photo.jpg'));
    expect(fetchMock).toHaveBeenCalledTimes(20);
  } finally {
    log.mockRestore();
    fetchMock.mockRestore();
    if (previousPath === undefined) delete process.env.MEVRIC_DATABASE_PATH; else process.env.MEVRIC_DATABASE_PATH = previousPath;
    if (previousKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = previousKey;
    rmSync(dir, { recursive: true, force: true });
  }
});

it('keeps urgent events publishable when DeepSeek fails, using only the original source headline', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { default: Database } = await import('better-sqlite3');
  const { vi } = await import('vitest');
  const { publish } = await import('../src/mevric.js');
  const dir = mkdtempSync(join(tmpdir(),'mevric-urgent-fallback-'));
  const oldPath=process.env.MEVRIC_DATABASE_PATH;
  const oldKey=process.env.DEEPSEEK_API_KEY;
  const mock=vi.spyOn(globalThis,'fetch').mockImplementation(async () => new Response('provider unavailable',{status:503}));
  const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
  const log=vi.spyOn(console,'log').mockImplementation(()=>{});
  try {
    process.env.MEVRIC_DATABASE_PATH=join(dir,'db.sqlite');
    process.env.DEEPSEEK_API_KEY='test';
    await publish(true); // initialize test DB
    const db=new Database(process.env.MEVRIC_DATABASE_PATH);
    const headline="Suspect, victim dead after SWAT responds to active threat near Tampa, Florida";
    const url='https://www.foxnews.com/us/tampa-active-threat';
    db.prepare('INSERT INTO stories(url,title,publisher,published_at) VALUES(?,?,?,?)').run(url,headline,'Fox News',new Date().toISOString());
    db.close();
    await publish(true);
    expect(mock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining(headline));
    expect(log).toHaveBeenCalledWith(expect.stringContaining(url));
    expect(warning).not.toHaveBeenCalled();
  } finally {
    mock.mockRestore();warning.mockRestore();log.mockRestore();
    if(oldPath===undefined)delete process.env.MEVRIC_DATABASE_PATH;else process.env.MEVRIC_DATABASE_PATH=oldPath;
    if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;
    rmSync(dir,{recursive:true,force:true});
  }
});

it('does not publish when the article page cannot verify its headline', async () => {
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
    db.prepare('INSERT INTO stories(url,title,publisher,published_at) VALUES(?,?,?,?)').run('https://npr.org/1', 'US Congress debates the federal budget', 'NPR', new Date().toISOString());
    db.close();
    await publish(false);
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0][0])).toContain('npr.org');
    const check = new Database(process.env.MEVRIC_DATABASE_PATH);
    expect(check.prepare('SELECT status FROM stories').get()).toEqual({ status: 'skipped' });
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
    const previousMedia = process.env.MEVRIC_MEDIA_APPROVED;
    const article = 'https://www.npr.org/2026/story';
    const rss = `<rss><item><title>News</title><link>${article}</link><pubDate>${new Date().toUTCString()}</pubDate></item></rss>`;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url) === article
      ? new Response('<html><meta property="og:image" content="https://npr.brightspotcdn.com/cover.jpg"></html>', { headers: { 'content-type': 'text/html' } })
      : new Response(rss, { headers: { 'content-type': 'application/rss+xml' } }));
    try {
      process.env.MEVRIC_DATABASE_PATH = join(dir, 'test.db');
      process.env.MEVRIC_MEDIA_APPROVED = 'true'; // only in this test fixture
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
      if (previousMedia === undefined) delete process.env.MEVRIC_MEDIA_APPROVED; else process.env.MEVRIC_MEDIA_APPROVED = previousMedia;
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


describe('Mevric rolling 24-hour cap', () => {
  it('caps 50 attempts in any rolling 24h, spaces normal posts by 30 min and urgent posts by 2 min', async () => {
    const { default: Database } = await import('better-sqlite3');
    const { publishingGate, MEVRIC_24H_POST_LIMIT, MEVRIC_POST_SPACING_MINUTES,MEVRIC_URGENT_SPACING_MINUTES,MEVRIC_24H_ALERT_LIMIT,alertCount24h } = await import('../src/mevric.js');
    expect(MEVRIC_24H_POST_LIMIT).toBe(50);
    expect(MEVRIC_POST_SPACING_MINUTES).toBe(30);
    expect(MEVRIC_URGENT_SPACING_MINUTES).toBe(2);
    expect(MEVRIC_24H_ALERT_LIMIT).toBe(5);
    const db = new Database(':memory:');
    try {
      db.exec('CREATE TABLE stories (url TEXT, status TEXT, attempted_at TEXT,post_kind TEXT)');
      const now = Date.parse('2026-11-04T12:00:00Z');
      const insert = db.prepare('INSERT INTO stories(url,status,attempted_at) VALUES(?,?,?)');
      for (let i=0;i<50;i++) insert.run(`https://example.com/${i}`,i%2===0?'queued':'attempted',new Date(now-3*3600_000).toISOString());
      expect(publishingGate(db, now)).toMatchObject({allowed:false,count:50});
      expect(publishingGate(db, now, true)).toMatchObject({allowed:false,count:50});
      db.prepare('UPDATE stories SET attempted_at=?').run(new Date(now-25*3600_000).toISOString());
      expect(publishingGate(db, now)).toMatchObject({allowed:true,count:0});
      db.prepare('UPDATE stories SET attempted_at=?,post_kind=? WHERE url=?').run(new Date(now-5*60_000).toISOString(),'news','https://example.com/0');
      expect(publishingGate(db, now)).toMatchObject({allowed:false,count:1});
      expect(publishingGate(db, now).reason).toContain('30 minutes');
      expect(publishingGate(db, now, true)).toMatchObject({ allowed:true,count:1 });
      db.prepare('UPDATE stories SET attempted_at=? WHERE url=?').run(new Date(now-1*60_000).toISOString(),'https://example.com/0');
      expect(publishingGate(db, now, true)).toMatchObject({ allowed:false,count:1 });
      expect(publishingGate(db, now, true).reason).toContain('2 minutes');
      db.prepare('UPDATE stories SET attempted_at=? WHERE url=?').run(new Date(now-31*60_000).toISOString(),'https://example.com/0');
      expect(publishingGate(db, now)).toMatchObject({allowed:true,count:1});
      // Legacy posts were all formatted ALERT, so they safely count as alerts.
      db.prepare('UPDATE stories SET attempted_at=?,post_kind=NULL WHERE url IN (?,?,?,?,?)').run(new Date(now-2*3600_000).toISOString(),...Array.from({length:5},(_,i)=>`https://example.com/${i}`));
      expect(alertCount24h(db, now)).toBe(5);
      expect(publishingGate(db, now, true).allowed).toBe(false);
      expect(publishingGate(db, now, false).allowed).toBe(true);
      // Even if the server clock crosses midnight, the rolling window remains.
      expect(publishingGate(db, now + 24*3600_000)).toMatchObject({allowed:true,count:0});
    } finally { db.close(); }
  });

  it('keeps definite Buffer X quota rejections eligible rather than losing articles', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { default: Database } = await import('better-sqlite3');
    const { vi } = await import('vitest');
    const { publish } = await import('../src/mevric.js');
    const dir = mkdtempSync(join(tmpdir(),'mevric-quota-'));
    const keys = ['MEVRIC_DATABASE_PATH','BUFFER_ACCESS_TOKEN','MEVRIC_BUFFER_CHANNEL_ID','DEEPSEEK_API_KEY'];
    const original = Object.fromEntries(keys.map(k=>[k,process.env[k]]));
    const warning = vi.spyOn(console,'warn').mockImplementation(()=>{});
    const fake = vi.spyOn(globalThis,'fetch').mockImplementation(async url => String(url).includes('api.buffer.com')
      ? new Response(JSON.stringify({data:{createPost:{message:'You have already scheduled the maximum number of posts Buffer allows for X (Twitter) within 24 hours (100). Please consider scheduling this post for a later time.'}}}),{status:200})
      : new Response('<meta property="og:title" content="US Congress votes on a major spending bill">',{status:200,headers:{'content-type':'text/html'}}));
    try {
      process.env.MEVRIC_DATABASE_PATH=join(dir,'test.db');
      process.env.DEEPSEEK_API_KEY='test';
      process.env.BUFFER_ACCESS_TOKEN='test';
      process.env.MEVRIC_BUFFER_CHANNEL_ID='test-channel';
      await publish(false); // create empty schema
      const db = new Database(process.env.MEVRIC_DATABASE_PATH);
      db.prepare('INSERT INTO stories(url,title,publisher,published_at) VALUES(?,?,?,?)').run('https://npr.org/test','US Congress votes on a major spending bill','NPR',new Date().toISOString());
      db.close();
      await publish(false);
      expect(fake).toHaveBeenCalledTimes(2);
      expect(warning).toHaveBeenCalledWith(expect.stringContaining('quota reached'));
      const read = new Database(process.env.MEVRIC_DATABASE_PATH);
      expect(read.prepare('SELECT status,attempted_at,provider_id,post_kind FROM stories').get()).toEqual({status:'new',attempted_at:null,provider_id:null,post_kind:null});
      read.close();
    } finally {
      fake.mockRestore(); warning.mockRestore();
      for(const k of keys){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}
      rmSync(dir,{recursive:true,force:true});
    }
  });
});
