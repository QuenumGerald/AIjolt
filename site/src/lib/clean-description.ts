/** Coupe le bruit scrape (JS UI Foorilla, jobs similaires, stats). */
const CUT_MARKERS = [
  'Close {',
  'document.body',
  'dispatchEvent',
  'showToasts',
  'CustomEvent',
  'Copy link',
  'Save Apply',
  'Similar jobs',
  'Stats Feedback',
  'Feedback Views:',
  '<script',
  '</script',
  'onclick=',
  'onerror=',
  'hx-get=',
  'Media Code Meet Work',
] as const;

function stripTags(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function cutAtJunk(value: string): string {
  let cut = value.length;
  for (const marker of CUT_MARKERS) {
    const index = value.indexOf(marker);
    if (index >= 0 && index < cut) cut = index;
  }
  // Truncate trailing ellipsis junk before a cut ("... Close {")
  let out = value.slice(0, cut);
  out = out.replace(/\s*\.{2,}\s*$/, '');
  out = out.replace(/\s+Language:\s*[a-z]{2}\s*$/i, '');
  out = out.replace(/\s+Published:\s*\d{4}-\d{2}-\d{2}\s*$/i, '');
  return out;
}

function collapseWhitespace(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Description affichable / SEO : texte seul, sans JS scrape ni listings voisins. */
export function cleanJobDescription(raw: string | null | undefined): string {
  if (!raw) return '';
  const stripped = stripTags(String(raw));
  const cut = cutAtJunk(stripped);
  return collapseWhitespace(cut);
}
