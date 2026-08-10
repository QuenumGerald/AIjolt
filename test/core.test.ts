import { describe, expect, it } from 'vitest'; import { analyzeAI } from '../src/ai.js'; import { deduplicate } from '../src/dedupe.js'; import { score } from '../src/scoring.js'; import { inferCountry, normalize } from '../src/normalize.js'; import { linkedinPost, xPost } from '../src/posts.js'; import { parseCsrfToken, parseDetail, parseListingLinks, parseRegionIds, topicFormBody } from '../src/collectors/foorilla.js'; import { bufferCreatePostPayload } from '../src/buffer.js';
import { parseGoogleNewsRss, parseHackerNews } from '../src/collectors/news.js'; import { cleanGeneratedPost, newsPrompt, validateNewsPost } from '../src/news-posts.js';
const raw = { externalId:'1', title:'Senior LLM Engineer', company:'Acme', location:'Remote, France', description:'Build RAG agents with Python and LangChain. Visa sponsorship available. '.repeat(30), postedAt:'2026-08-01T00:00:00Z', url:'https://example.com/jobs/1', source:'lever' as const, salary:'€100k-120k' };
describe('AI filtering', () => { it('accepts a core AI role', () => expect(analyzeAI(raw).relevant).toBe(true)); it('rejects incidental AI', () => expect(analyzeAI({title:'Accountant',description:'Use AI-powered office software'}).relevant).toBe(false)); });
describe('scoring', () => { it('rewards strong recent jobs', () => { const j=normalize(raw); expect(score(j,new Date('2026-08-02'))).toBeGreaterThan(70); }); });
describe('deduplication', () => { it('deduplicates normalized identity and URL variants', () => { const a=normalize(raw), b={...a,externalId:'2',url:a.url+'?ref=x'}; expect(deduplicate([a,b])).toHaveLength(1); }); });
describe('normalization', () => { it('extracts work mode, country and skills', () => { const job=normalize(raw); expect(job.workMode).toBe('remote'); expect(job.country).toBe('France'); expect(job.skills).toEqual(expect.arrayContaining(['LLM','RAG','Python'])); }); it('does not mistake text suffixes for country codes', () => { expect(inferCountry('Buenos Aires')).toBe('Unknown'); expect(inferCountry('Tân Bình, Thành phố Hồ Chí Minh, Vietnam')).toBe('Unknown'); expect(inferCountry('Gurugram, HR, India')).toBe('Unknown'); }); it('recognizes Europe and North America locations', () => { expect(inferCountry('Tirana, Albania')).toBe('Albania'); expect(inferCountry('Toronto, Canada')).toBe('Canada'); expect(inferCountry('Mexico City, Mexico')).toBe('Mexico'); expect(inferCountry('San Francisco, California, United States')).toBe('United States'); expect(inferCountry('Nuremberg, BY, Germany')).toBe('Germany'); }); });
describe('post generation', () => { it('keeps the complete title and direct application URL', () => { const job=normalize(raw); expect(xPost(job)).toContain(raw.title); expect(xPost(job)).toContain(`Apply: ${raw.url}`); expect(linkedinPost(job)).toContain(`Apply directly:\n${raw.url}`); }); });
describe('Foorilla discovery', () => {
  it('selects both requested Foorilla regions by their native IDs', () => { expect(parseRegionIds({ results: [{ pk: 3, name: 'Europe' }, { pk: 5, name: 'North America' }, { pk: 2, name: 'Asia/Pacific' }] })).toEqual([3, 5]); });
  it('posts the native AI, Data, and Machine Learning topic', () => { expect(topicFormBody(['101']).toString()).toBe('topic=101'); });
  it('extracts the CSRF token needed before applying Foorilla regions', () => { expect(parseCsrfToken('<input name="csrfmiddlewaretoken" value="token-123">')).toBe('token-123'); });
  it('extracts listing links and visible titles without a search keyword', () => { const html = '<a class="stretched-link" hx-get="/hiring/jobs/ai-role-123/">\n AI Engineer \n</a>'; expect(parseListingLinks(html)).toEqual([{ path: '/hiring/jobs/ai-role-123/', title: 'AI Engineer' }]); });
  it('extracts a job detail and preserves the direct Foorilla URL', () => { const html = '<h1>AI Engineer</h1><div class="px-1 border-bottom"><div>Paris, France</div></div><a href="/hiring/companies/">@ Acme AI</a><div class="px-1 border-bottom pb-2"><strong>Tasks:</strong> Build LLM systems</div><div class="d-flex justify-content-between">Published: <span>2026-08-02</span></div><a href="/hiring/jobs/apply-123/apply/">Apply</a>'; const job = parseDetail(html, '/hiring/jobs/ai-role-123/', 'Fallback', 'https://foorilla.com'); expect(job.title).toBe('AI Engineer'); expect(job.company).toBe('Acme AI'); expect(job.url).toBe('https://foorilla.com/hiring/jobs/ai-role-123/'); expect(job.location).toContain('Paris'); expect(job.applyUrl).toBe('https://foorilla.com/hiring/jobs/apply-123/apply/'); });
});
describe('Buffer publishing contract', () => { it('targets one channel and automatic queue scheduling', () => { const payload = bufferCreatePostPayload('hello', 'channel-1'); expect(payload.variables).toEqual({ text: 'hello', channelId: 'channel-1' }); expect(payload.query).toContain('schedulingType: automatic'); expect(payload.query).toContain('mode: addToQueue'); }); });

describe('AI news collection', () => {
  const now = new Date('2026-08-10T12:00:00Z');
  it('accepts a recent AI headline from an allowed Google News publisher', () => {
    const xml = `<rss><channel><item><title><![CDATA[OpenAI model finds a new failure mode - Reuters]]></title><link>https://news.google.com/articles/1</link><guid>story-1</guid><pubDate>Mon, 10 Aug 2026 10:00:00 GMT</pubDate><source>Reuters</source><description><![CDATA[Researchers documented the AI model behavior.]]></description></item></channel></rss>`;
    const [item] = parseGoogleNewsRss(xml, now);
    expect(item.title).toBe('OpenAI model finds a new failure mode');
    expect(item.publisher).toBe('Reuters');
    expect(item.buzzScore).toBeGreaterThan(35);
  });
  it('rejects an untrusted publisher and stale Hacker News items', () => {
    const xml = `<rss><channel><item><title>ChatGPT rumor - Random Blog</title><link>https://news.google.com/articles/2</link><guid>story-2</guid><pubDate>Mon, 10 Aug 2026 10:00:00 GMT</pubDate><source>Random Blog</source></item></channel></rss>`;
    expect(parseGoogleNewsRss(xml, now)).toHaveLength(0);
    expect(parseHackerNews([{ objectID: '3', title: 'OpenAI release', url: 'https://openai.com/index/release', created_at: '2026-08-01T00:00:00Z', points: 500 }], now)).toHaveLength(0);
  });
});

describe('AI news voice guardrails', () => {
  it('cleans wrappers and rejects hashtags, emoji and overlong copy', () => {
    expect(cleanGeneratedPost('```text\n"Claude called it onboarding."\n```')).toBe('Claude called it onboarding.');
    expect(validateNewsPost('Claude called it onboarding. #AI')).toContain('contains a hashtag');
    expect(validateNewsPost('Claude called it onboarding. 🤖')).toContain('contains an emoji');
    expect(validateNewsPost('x'.repeat(281))).toContain('over 280 characters');
  });
  it('forces a factual setup and a clear sarcastic target in the prompt', () => {
    const prompt = newsPrompt({ externalId: '1', source: 'manual', url: 'https://example.com', title: 'A model crossed a sandbox boundary', summary: 'The lab confirmed a configuration error.', publisher: 'Example', publishedAt: '2026-08-10T10:00:00Z', buzzScore: 100 }, 280);
    expect(prompt).toContain('may use only these facts');
    expect(prompt).toContain('Pick one clear target');
    expect(prompt).toContain('end by humiliating');
    expect(prompt).toContain('Do not invent facts');
  });
});

// Regression covered by integration behavior: Apply resolution must use a normal browser request, not HX-Request.
