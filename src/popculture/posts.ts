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

// Keep the verified headline as the factual anchor. Add a short, specific
// reaction prompt only when the headline supports it; no invented hype or facts.
function videoHook(title: string, category: Category): string | undefined {
  if (/\b(dies|dead|death|injured|injury|illness|abuse|tragedy|funeral|tribute|memorial|diagnosed|cancer|hospitali[sz]ed|allegations?|lawsuit|apolog(?:y|ises|izes)|accus(?:ed|ation))\b/i.test(title)) return;
  if (category === 'music') {
    if (/\b(duet|duets|reunites?|reunited|collaborat(?:es?|ion))\b/i.test(title)) return 'Who should they team up with next?';
    if (/\b(performs?|performed|live performance|sings?|concert performance)\b/i.test(title)) return 'How would you rate this performance?';
    if (/\b(tour|tour dates)\b/i.test(title)) return 'Would you go?';
    if (/\b(new album|new single|new song|music video)\b/i.test(title)) return 'On repeat or a skip?';
  }
  if (category === 'awards' && /\b(wins?|won|takes? home)\b/i.test(title)) return 'Deserved win?';
  if (category === 'trailer') return 'Would you watch it?';
  if ((category === 'film' || category === 'series') && /\b(cast|casting|joins?|starring)\b/i.test(title)) return 'Good casting choice?';
  if (category === 'viral' && /\b(cosplay|gaming|gameplay|speedrun)\b/i.test(title)) return 'Could you pull this off?';
  return undefined;
}

/** Native video caption: factual headline, selective hook, relevant hashtags.
 * Keep article URL in SQLite, never truncate the headline or exceed 280 characters.
 */
export function formatPost(title: string, category: Category = 'news', summary = ''): string | null {
  const base = cleanTitle(title);
  if (!base) return null;
  const hook = videoHook(base, category);
  const context = cleanTitle(summary.replace(/<[^>]*>/g,' ').replace(/https?:\/\/\S+/g,''));
  const extra = context && !context.toLowerCase().includes(base.toLowerCase()) && !base.toLowerCase().includes(context.toLowerCase()) ? context : '';
  const candidates = [
    ...(extra ? [`${base}\n\n${extra}\n${hook ? hook + '\n' : ''}${TOPIC_TAG[category]} #Klieg`, `${base}\n\n${extra}\n${TOPIC_TAG[category]} #Klieg`] : []),
    ...(hook ? [`${base}\n\n${hook}\n${TOPIC_TAG[category]} #Klieg`] : []),
    `${base}\n${TOPIC_TAG[category]} #Klieg`, `${base}\n#Klieg`,
  ];
  return candidates.find(text => Array.from(text).length <= 280) ?? null;
}
