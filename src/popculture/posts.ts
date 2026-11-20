export function formatPost(title: string, url: string): string | null {
  const text = `${title.trim()}\n${url.trim()}`;
  return Array.from(text).length <= 280 ? text : null;
}
