/** Drop dash separators from headlines. Keep hyphenated words such as 186-Carat. */
export function cleanTitle(title: string): string {
  return title
    .replace(/[\u2013\u2014]/g, ' ')
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatPost(title: string, url: string): string | null {
  const text = `${cleanTitle(title)}\n${url.trim()}`;
  return Array.from(text).length <= 280 ? text : null;
}
