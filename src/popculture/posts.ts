import type { Category } from './types.js';

/** Drop dash separators from headlines. Keep hyphenated words such as 186-Carat. */
export function cleanTitle(title: string): string {
  return title
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TOPIC_TAG: Record<Category, string> = {
  film: '#Movies',
  series: '#TV',
  music: '#Music',
  celebrity: '#Celebrities',
  awards: '#Awards',
  trailer: '#MovieTrailer',
  news: '#News',
  animals: '#Animals',
  science: '#Science',
  sport: '#Sports',
  weather: '#Weather',
  viral: '#ViralVideo',
};

/** Original headline and article URL remain intact; add two compact relevant tags.
 * Never exceed the platform limit by truncating a headline or its source URL.
 */
export function formatPost(title: string, url: string, category: Category = 'news'): string | null {
  const base = `${cleanTitle(title)}\n${url.trim()}`;
  const candidates = [`${base}\n${TOPIC_TAG[category]} #Klieg`, `${base}\n#Klieg`];
  return candidates.find(text => Array.from(text).length <= 280) ?? null;
}
