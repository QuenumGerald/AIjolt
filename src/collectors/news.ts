import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { getJson, getText } from '../http.js';
import type { NewsItem } from '../types.js';

const decodeXml = (value: string): string => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
const stripHtml = (value: string): string => decodeXml(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml: string, name: string): string => decodeXml(xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '').trim();
const hash = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 24);
const isoDate = (value: string): string | null => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const ageHours = (date: string, now = new Date()): number => Math.max(0, (now.getTime() - new Date(date).getTime()) / 3_600_000);
const isRecent = (date: string, now = new Date()): boolean => Number.isFinite(new Date(date).getTime()) && ageHours(date, now) <= config.news.maxAgeHours;
const aiSignal = /\bAI\b|artificial intelligence|OpenAI|ChatGPT|Anthropic|Claude|Gemini|DeepMind|xAI|Grok|LLM|language model|Nvidia|Mistral|Kimi|DeepSeek/i;

function freshnessScore(publishedAt: string, now = new Date()): number {
  return Math.max(0, Math.round(60 * (1 - ageHours(publishedAt, now) / Math.max(1, config.news.maxAgeHours))));
}

export function parseGoogleNewsRss(xml: string, now = new Date()): NewsItem[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  return items.flatMap(block => {
    const rawTitle = stripHtml(tag(block, 'title'));
    const publisher = stripHtml(tag(block, 'source')) || rawTitle.split(' - ').at(-1)?.trim() || 'Unknown';
    const suffix = ` - ${publisher}`;
    const title = rawTitle.endsWith(suffix) ? rawTitle.slice(0, -suffix.length).trim() : rawTitle;
    const url = stripHtml(tag(block, 'link'));
    const publishedAt = isoDate(tag(block, 'pubDate'));
    if (!title || !url.startsWith('http') || !publishedAt || !isRecent(publishedAt, now) || !aiSignal.test(`${title} ${stripHtml(tag(block, 'description'))}`)) return [];
    if (!config.news.allowedPublishers.has(publisher.toLowerCase())) return [];
    return [{
      externalId: hash(tag(block, 'guid') || url), source: 'google-news' as const, url, title,
      summary: stripHtml(tag(block, 'description')).slice(0, 1200), publisher, publishedAt,
      buzzScore: 40 + freshnessScore(publishedAt, now),
    }];
  });
}

type HackerNewsHit = { objectID?: string; title?: string; story_title?: string; url?: string; story_url?: string; created_at?: string; points?: number; num_comments?: number; story_text?: string };
type HackerNewsResponse = { hits?: HackerNewsHit[] };

function allowedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return [...config.news.allowedDomains].some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch { return false; }
}

export function parseHackerNews(hits: HackerNewsHit[], now = new Date()): NewsItem[] {
  return hits.flatMap(hit => {
    const title = (hit.title || hit.story_title || '').trim();
    const url = (hit.url || hit.story_url || '').trim();
    const publishedAt = hit.created_at ? isoDate(hit.created_at) : null;
    if (!hit.objectID || !title || !url || !publishedAt || !isRecent(publishedAt, now) || !aiSignal.test(title) || !allowedDomain(url)) return [];
    const publisher = new URL(url).hostname.replace(/^www\./, '');
    const engagement = Math.min(100, Math.max(0, hit.points ?? 0) + Math.max(0, hit.num_comments ?? 0) * 1.5);
    return [{
      externalId: hit.objectID, source: 'hacker-news' as const, url, title,
      summary: stripHtml(hit.story_text ?? '').slice(0, 1200), publisher, publishedAt,
      buzzScore: Math.round(freshnessScore(publishedAt, now) + engagement),
    }];
  });
}

export async function collectNewsSources(now = new Date()): Promise<NewsItem[]> {
  const tasks: Array<Promise<NewsItem[]>> = [];
  if (config.news.googleEnabled) for (const query of config.news.queries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:1d`)}&hl=en-US&gl=US&ceid=US:en`;
    tasks.push(getText(url).then(xml => parseGoogleNewsRss(xml, now)));
  }
  if (config.news.hackerNewsEnabled) for (const query of config.news.queries) {
    const cutoff = Math.floor((now.getTime() - config.news.maxAgeHours * 3_600_000) / 1000);
    const url = `https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=50&numericFilters=created_at_i%3E${cutoff}&query=${encodeURIComponent(query)}`;
    tasks.push(getJson<HackerNewsResponse>(url).then(payload => parseHackerNews(payload.hits ?? [], now)));
  }
  const settled = await Promise.allSettled(tasks);
  if (tasks.length && settled.every(result => result.status === 'rejected')) throw new Error('Every AI news source request failed');
  const items = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const unique = new Map<string, NewsItem>();
  for (const item of items) {
    const key = `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${item.publisher.toLowerCase()}`;
    if (!unique.has(key) || unique.get(key)!.buzzScore < item.buzzScore) unique.set(key, item);
  }
  return [...unique.values()];
}
