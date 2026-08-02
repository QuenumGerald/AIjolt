import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { config } from './config.js';
const limit = pLimit(config.concurrency);
let last = 0;
export async function getJson<T>(url: string): Promise<T> {
  return limit(() => pRetry(async () => {
    const wait = Math.max(0, 1000 / Math.max(1, config.rps) - (Date.now() - last));
    if (wait) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    const response = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'AIJolt/0.1 (+job-aggregation)' }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
    return response.json() as Promise<T>;
  }, { retries: 3, minTimeout: 500, factor: 2 }));
}
