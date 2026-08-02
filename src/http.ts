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
