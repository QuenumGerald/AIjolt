import type { Category } from './types.js';

const CATEGORIES: Array<[Category, RegExp]> = [
  ['animals', /\b(animals?|pets?|dogs?|cats?|whales?|sharks?|wildlife|pupp(?:y|ies)|kitten|rescues? animal)\b/i],
  ['weather', /\b(storms?|tornado(?:es)?|hurricanes?|floods?|lightning|wildfires?|weather)\b/i],
  ['science', /\b(science|scientists?|space|nasa|earthquake|volcano|astronauts?|discovery|mars|solar)\b/i],
  ['sport', /\b(sports?|football|basketball|soccer|nba|nfl|olympics?|athletes?|touchdown)\b/i],
  ['viral', /\b(viral|caught on (?:camera|video)|rescues?|incredible|amazing|unbelievable)\b/i],
  ['awards', /\b(grammys?|oscars?|emmys?|golden globes?|bafta|tony awards?|nominat\w*|award ceremony|hall of fame)\b/i],
  ['trailer', /\b(trailers?|teasers?|first look|sneak peek|official clip)\b/i],
  ['music', /\b(albums?|singles?|tours?|concerts?|songs?|soundtracks?|rapper|singer|band|billboard|grammy|setlist|headlin\w*)\b/i],
  ['series', /\b(series|seasons?|episodes?|showrunner|tv|streaming show|limited series|hbo|netflix|disney\+|hulu|prime video)\b/i],
  ['film', /\b(films?|movies?|director|box office|cast|starring|sequel|franchise|cinema|a24)\b/i],
  ['celebrity', /\b(premiere|red carpet|actor|actress|celebrity|star(?:s|ring)?|engaged|wedding)\b/i],
];

const RUMOR = /\b(rumou?rs?|speculation|unconfirmed|sources say|sources familiar|insider claims?|gossip)\b/i;
const PROMO = /\b(giveaway|sweepstakes|shop (?:the |now)|coupon|discount code|sponsored post|where to (?:buy|stream)|top\s+\d+\b|best .{0,40} to (?:watch|stream))\b/i;

export function assessRelevance(title: string, summary: string, hinted?: Category): { ok: true; category: Category; score: number } | { ok: false; reason: string } {
  const text = `${title} ${summary}`;
  if (RUMOR.test(text)) return { ok: false, reason: 'unconfirmed rumor language' };
  if (PROMO.test(title)) return { ok: false, reason: 'listicle or promotional headline' };
  const matched = CATEGORIES.find(([, pattern]) => pattern.test(text))?.[0] ?? hinted ?? 'news';
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
