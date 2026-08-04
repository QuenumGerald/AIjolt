import { createHttpSession, getFinalUrl, getEmployerName, sessionGetJson, sessionGetText, sessionPostForm, type HttpSession } from '../http.js';
import type { RawJob } from '../types.js';
const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const first = (html: string, pattern: RegExp) => { const match = html.match(pattern); return match?.[1] ? text(match[1]) : ''; };
type RegionResponse = { results: Array<{ pk: number; name: string }> };
const regionNames = ['Europe', 'North America'];
export const parseCsrfToken = (html: string) => html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/i)?.[1] ?? '';
export const parseRegionIds = (data: RegionResponse, names = regionNames) => names.map(name => data.results.find(region => region.name.toLowerCase() === name.toLowerCase())?.pk).filter((pk): pk is number => pk !== undefined);
export const topicFormBody = (topics: string[]) => new URLSearchParams(topics.map(topic => ['topic', topic]));
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
async function applyRegions(session: HttpSession, baseUrl: string) {
  const form = await sessionGetText(session, `${baseUrl}/regions/hiring/`, { 'HX-Request': 'true', 'X-Screen': 'D' });
  const csrf = parseCsrfToken(form);
  if (!csrf) throw new Error('Foorilla region form did not include a CSRF token');
  const regionIds = await Promise.all(regionNames.map(async name => {
    const response = await sessionGetJson<RegionResponse>(session, `${baseUrl}/ac/geo/regions/?q=${encodeURIComponent(name)}`, { 'X-Screen': 'D' });
    return parseRegionIds(response, [name])[0];
  }));
  const selected = regionIds.filter((pk): pk is number => pk !== undefined);
  if (selected.length !== regionNames.length) throw new Error('Foorilla did not return both requested regions');
  const body = new URLSearchParams([['csrfmiddlewaretoken', csrf], ...selected.map(pk => ['regions', String(pk)])]);
  const response = await sessionPostForm(session, `${baseUrl}/regions/hiring/`, body, { 'HX-Request': 'true', 'X-Screen': 'D', Referer: `${baseUrl}/hiring/`, Origin: baseUrl });
  await response.body?.cancel();
}
async function applyTopics(session: HttpSession, baseUrl: string, topics: string[]) {
  for (const topic of topics) {
    const response = await sessionPostForm(session, `${baseUrl}/topics/hiring/`, topicFormBody([topic]), { 'HX-Request': 'true', 'X-Screen': 'D', Referer: `${baseUrl}/hiring/`, Origin: baseUrl });
    await response.body?.cancel();
  }
}
export async function foorilla(pages: number, baseUrl: string, topics = ['101']): Promise<RawJob[]> {
  const jobs: RawJob[] = []; const seen = new Set<string>();
  const session = createHttpSession();
  await applyRegions(session, baseUrl);
  await applyTopics(session, baseUrl, topics);
  for (let page = 1; page <= pages; page++) {
    const query = page === 1 ? '' : `?page=${page}`;
    const html = await sessionGetText(session, `${baseUrl}/hiring/jobs/${query}`, { 'HX-Request': 'true', 'X-Screen': 'D' }); const links = parseListingLinks(html); if (!links.length) break;
    for (const link of links) {
      if (seen.has(link.path)) continue; seen.add(link.path); const detail = await sessionGetText(session, `${baseUrl}${link.path}`, { 'HX-Request': 'true', 'X-Screen': 'D' });
      const parsed = parseDetail(detail, link.path, link.title, baseUrl);
      if (!parsed.applyUrl) continue;
      try {
        const finalUrl = await getFinalUrl(parsed.applyUrl, { Referer: `${baseUrl}${link.path}` });
        if (new URL(finalUrl).hostname === new URL(baseUrl).hostname) continue;
        parsed.url = finalUrl;
        if (/^[A-Z]\.\.\.$/i.test(parsed.company)) parsed.company = (await getEmployerName(finalUrl)) ?? parsed.company;
      } catch { continue; }
      const { applyUrl: _applyUrl, ...job } = parsed; jobs.push(job);
    }
    if (links.length < 20) break;
  }
  return jobs;
}
