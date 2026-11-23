import type { Category } from './types.js';

// Entertainment-first editorial policy. Generic news, weather, science, crime,
// and animal stories must never be promoted by generic excitement adjectives.
const CATEGORIES: Array<[Category, RegExp]> = [
  ['trailer', /\b(trailers?|teasers?|sneak peek|official clip|first look at (?:the )?(?:film|movie|series|show))\b/i],
  ['awards', /\b(grammys?|oscars?|emmys?|golden globes?|bafta|tony awards?|award ceremony)\b/i],
  ['music', /\b(albums?|singles?|concerts?|songs?|soundtracks?|rappers?|singers?|bands?|billboard|grammy|music video|music festival|world tour|stadium tour|tour dates)\b/i],
  ['series', /\b(tv series|streaming series|new series|season (?:[0-9]+|finale)|episodes?|showrunner|hbo|netflix|disney\+|hulu|prime video|anime)\b/i],
  ['film', /\b(films?|movies?|box office|cast|starring|sequel|franchise|cinema|a24|marvel|pixar)\b/i],
  ['celebrity', /\b(red carpet|actors?|actresses?|celebrit(?:y|ies)|hollywood|premiere|pop star|influencers?|content creators?|streamers?|tiktokers?)\b/i],
  ['viral', /\b(viral (?:video|moment|clip|dance|challenge|meme)|internet meme|tiktok trend|tiktok (?:dance )?challenge|funny (?:video|clip)|prank|cosplay|gaming|video games?|esports?|speedrun|streamer)\b/i],
];

// Reject broad hard-news subjects even when their headlines contain "viral",
// "caught on camera", "star" or other entertainment-adjacent words.
const HARD_NEWS = /\b(president|prime minister|parliament|election|senate|congress|white house|politic(?:s|al)|government|military|warfare|missile|airstrike|bombing|hostages?|terroris(?:m|t)|killed|murder|shooting|arrested|police|fbi|ice agents?|immigration raid|court ruling|earthquake|flooding|floods?|tornado|hurricane|wildfire|stock market|inflation|interest rates|tariffs|breaking news|news bulletin|weather forecast)\b/i;
const ENTERTAINMENT_CONTEXT = /\b(movie|film|cinema|series|actor|actress|singer|rapper|concert|album|song|trailer|teaser|gaming|gameplay|video game|streamer|tiktok|meme|celebrity|hollywood|netflix|marvel|disney|anime|music|oscars|grammy)\b/i;

const RUMOR = /\b(rumou?rs?|speculation|unconfirmed|sources say|sources familiar|insider claims?|gossip)\b/i;
const PROMO = /\b(giveaway|sweepstakes|shop (?:the |now)|coupon|discount code|sponsored post|where to (?:buy|stream)|top\s+\d+\b|best .{0,40} to (?:watch|stream))\b/i;

export function assessRelevance(title: string, summary: string, hinted?: Category): { ok: true; category: Category; score: number } | { ok: false; reason: string } {
  const text = `${title} ${summary}`;
  if (HARD_NEWS.test(title) && !ENTERTAINMENT_CONTEXT.test(title)) return { ok: false, reason: 'general news outside Klieg entertainment theme' };
  if (RUMOR.test(text)) return { ok: false, reason: 'unconfirmed rumor language' };
  if (PROMO.test(title)) return { ok: false, reason: 'listicle or promotional headline' };
  const matched = CATEGORIES.find(([, pattern]) => pattern.test(title))?.[0]
    ?? (hinted && ['trailer', 'awards', 'music', 'film', 'series', 'celebrity'].includes(hinted) && ENTERTAINMENT_CONTEXT.test(text) ? hinted : null);
  if (!matched) return { ok: false, reason: 'no explicit pop culture or entertainment signal' };
  if (HARD_NEWS.test(text) && !ENTERTAINMENT_CONTEXT.test(title)) return { ok: false, reason: 'general news outside Klieg entertainment theme' };
  let score = 48;
  if (matched === 'trailer') score += 18;
  if (matched === 'awards') score += 16;
  if (matched === 'music') score += 12;
  if (matched === 'film' || matched === 'series') score += 8;
  if (/\b(announces?|announced|unveils?|premieres?|releases?|released|debuts?|wins?|nominated|cast|joins?)\b/i.test(text)) score += 8;
  return { ok: true, category: matched, score };
}

export function freshnessScore(publishedAt: string, now: Date, maxAgeHours: number): number {
  const age = Math.max(0, (now.getTime() - new Date(publishedAt).getTime()) / 3_600_000);
  return Math.round(24 * (1 - age / Math.max(1, maxAgeHours)));
}

export function tokens(value: string): string[] {
  return value.toLowerCase().replace(/&amp;/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(word => word.length > 2 && !['the', 'and', 'for', 'with', 'from', 'that', 'this'].includes(word));
}

export function titlesMatch(left: string, right: string): boolean {
  const a = tokens(left);
  const b = tokens(right);
  if (a.join(' ') === b.join(' ') && a.length > 0) return true;
  const setA = new Set(a);
  const setB = new Set(b);
  if (Math.min(setA.size, setB.size) < 4) return false;
  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared += 1;
  return shared / new Set([...setA, ...setB]).size >= 0.8;
}
