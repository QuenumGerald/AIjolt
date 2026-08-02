import { getText } from '../http.js';
import type { RawJob } from '../types.js';
const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const first = (html: string, pattern: RegExp) => { const match = html.match(pattern); return match?.[1] ? text(match[1]) : ''; };
function listingLinks(html: string) { const result: Array<{ path: string; title: string }> = []; const pattern = /<a class="stretched-link"[\s\S]*?hx-get="(\/hiring\/jobs\/[^"?]+)"[\s\S]*?>([\s\S]*?)<\/a>/g; for (const match of html.matchAll(pattern)) result.push({ path: match[1], title: text(match[2]) }); return result; }
export async function foorilla(pages: number, baseUrl: string): Promise<RawJob[]> {
  const jobs: RawJob[] = []; const seen = new Set<string>();
  for (let page = 1; page <= pages; page++) {
    const query = page === 1 ? '' : `?page=${page}`;
    const html = await getText(`${baseUrl}/hiring/jobs/${query}`, { 'HX-Request': 'true', 'X-Screen': 'D' }); const links = listingLinks(html); if (!links.length) break;
    for (const link of links) {
      if (seen.has(link.path)) continue; seen.add(link.path); const detail = await getText(`${baseUrl}${link.path}`, { 'HX-Request': 'true', 'X-Screen': 'D' });
      const title = first(detail, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || link.title;
      const description = text(detail.match(/<div class="px-1 border-bottom pb-2">([\s\S]*?)<\/div>\s*<div class="d-flex justify-content-between/i)?.[1] ?? detail);
      const company = first(detail, /<a href="\/hiring\/companies\/"[^>]*>\s*([^<]+)/i).replace(/^@\s*/, '') || 'Unknown company';
      const location = first(detail, /<h1[^>]*>[\s\S]*?<\/h1>[\s\S]*?<div class="px-1 border-bottom">[\s\S]*?<div>[\s\S]*?([^<>]+?)\s*<\/div>/i);
      const postedAt = first(detail, /Published:\s*<[^>]+>([^<]+)/i);
      jobs.push({ externalId: link.path.split('/').filter(Boolean).at(-1) ?? link.path, title, company, location, description, postedAt, url: `${baseUrl}${link.path}`, source: 'foorilla' });
    }
    if (links.length < 20) break;
  }
  return jobs;
}
