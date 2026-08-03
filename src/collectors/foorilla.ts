import { getText, getFinalUrl } from '../http.js';
import type { RawJob } from '../types.js';
const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const first = (html: string, pattern: RegExp) => { const match = html.match(pattern); return match?.[1] ? text(match[1]) : ''; };
export function parseListingLinks(html: string) { const result: Array<{ path: string; title: string }> = []; const pattern = /<a class="stretched-link"[\s\S]*?hx-get="(\/hiring\/jobs\/[^"?]+)"[\s\S]*?>([\s\S]*?)<\/a>/g; for (const match of html.matchAll(pattern)) result.push({ path: match[1], title: text(match[2]) }); return result; }
export function parseDetail(detail: string, path: string, fallbackTitle: string, baseUrl: string): RawJob & { applyUrl?: string } {
  const title = first(detail, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || fallbackTitle;
  const description = text(detail.match(/<div class="px-1 border-bottom pb-2">([\s\S]*?)<\/div>\s*<div class="d-flex justify-content-between/i)?.[1] ?? detail);
  const company = first(detail, /<a href="\/hiring\/companies\/"[^>]*>\s*([^<]+)/i).replace(/^@\s*/, '') || 'Unknown company';
  const location = first(detail, /<h1[^>]*>[\s\S]*?<\/h1>[\s\S]*?<div class="px-1 border-bottom">[\s\S]*?<div>[\s\S]*?([^<>]+?)\s*<\/div>/i);
  const postedAt = first(detail, /Published:\s*<[^>]+>([^<]+)/i);
  const applyAnchor = [...detail.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .find(match => /\bapply\b/i.test(text(match[2])) || /\/apply\//i.test(match[1]));
  const applyHref = applyAnchor?.[1];
  const applyUrl = applyHref ? new URL(decode(applyHref), baseUrl).toString() : undefined;
  return { externalId: path.split('/').filter(Boolean).at(-1) ?? path, title, company, location, description, postedAt, url: `${baseUrl}${path}`, source: 'foorilla', applyUrl };
}
export async function foorilla(pages: number, baseUrl: string): Promise<RawJob[]> {
  const jobs: RawJob[] = []; const seen = new Set<string>();
  for (let page = 1; page <= pages; page++) {
    const query = page === 1 ? '' : `?page=${page}`;
    const html = await getText(`${baseUrl}/hiring/jobs/${query}`, { 'HX-Request': 'true', 'X-Screen': 'D' }); const links = parseListingLinks(html); if (!links.length) break;
    for (const link of links) {
      if (seen.has(link.path)) continue; seen.add(link.path); const detail = await getText(`${baseUrl}${link.path}`, { 'HX-Request': 'true', 'X-Screen': 'D' });
      const parsed = parseDetail(detail, link.path, link.title, baseUrl);
      if (!parsed.applyUrl) continue;
      try {
        const finalUrl = await getFinalUrl(parsed.applyUrl, { 'X-Screen': 'D', Referer: `${baseUrl}${link.path}` });
        if (new URL(finalUrl).hostname === new URL(baseUrl).hostname) continue;
        parsed.url = finalUrl;
      } catch { continue; }
      const { applyUrl: _applyUrl, ...job } = parsed; jobs.push(job);
    }
    if (links.length < 20) break;
  }
  return jobs;
}
