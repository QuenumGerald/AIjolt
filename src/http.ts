import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { config } from './config.js';

const limit = pLimit(config.concurrency);
let nextAllowedAt = 0;

async function request(url: string, accept: string, extraHeaders: Record<string, string> = {}): Promise<Response> {
  const now = Date.now();
  const slot = Math.max(now, nextAllowedAt);
  nextAllowedAt = slot + 1000 / Math.max(1, config.rps);
  const wait = slot - now;
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  const response = await fetch(url, { headers: { accept, 'user-agent': 'AIJolt/0.1 (+job-aggregation)', ...extraHeaders }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

export function getJson<T>(url: string): Promise<T> {
  return limit(() => pRetry(async () => (await request(url, 'application/json')).json() as Promise<T>, { retries: 3, minTimeout: 500, factor: 2 }));
}

export function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  return limit(() => pRetry(async () => {
    const response = await request(url, 'text/html', headers);
    return response.text();
  }, { retries: 3, minTimeout: 500, factor: 2 }));
}

export function getFinalUrl(url: string, headers: Record<string, string> = {}): Promise<string> {
  return limit(() => pRetry(async () => {
    const browserHeaders: Record<string, string> = {
      accept: 'text/html',
      'user-agent': 'Mozilla/5.0 (compatible; AIJolt/0.1)',
      ...headers,
    };
    const referer = headers.Referer ?? headers.referer;
    if (referer) {
      const detailResponse = await fetch(referer, {
        headers: browserHeaders,
        signal: AbortSignal.timeout(20_000),
      });
      const setCookie = detailResponse.headers.get('set-cookie');
      await detailResponse.body?.cancel();
      if (setCookie) browserHeaders.Cookie = setCookie.split(';', 1)[0];
    }
    const response = await fetch(url, {
      redirect: 'manual',
      headers: browserHeaders,
      signal: AbortSignal.timeout(20_000),
    });
    await response.body?.cancel();
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Redirect without Location: ${url}`);
      return new URL(location, url).toString();
    }
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    return response.url;
  }, { retries: 3, minTimeout: 500, factor: 2 }));
}

export async function getEmployerName(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'jobs.smartrecruiters.com') {
      const company = parsed.pathname.split('/').filter(Boolean)[0];
      if (company) return decodeURIComponent(company);
    }
    const response = await fetch(url, {
      headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; AIJolt/0.1)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const candidates = [
      html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1],
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)?.[1],
      html.match(/"hiringOrganization"\s*:\s*\{[\s\S]{0,500}?"name"\s*:\s*"([^"]+)"/i)?.[1],
      html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.split('|').at(-1)?.trim(),
    ].filter((value): value is string => Boolean(value));
    for (const value of candidates) {
      const cleaned = value.replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/\s+Career Site$/i, '').trim();
      if (cleaned && !/^(careers?|jobs?|smartrecruiters)$/i.test(cleaned)) return cleaned;
    }
    const jobsSubdomain = parsed.hostname.match(/^jobs\.([^.]+)\./i)?.[1];
    return jobsSubdomain ? jobsSubdomain.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : null;
  } catch { return null; }
}
