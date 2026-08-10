import { accessSync, constants, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';
import { db } from './db.js';

export function doctor(): void {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const boardCount = config.boards.greenhouse.length + config.boards.lever.length + config.boards.ashby.length;
  const sources = boardCount + (config.discovery.foorilla ? 1 : 0);
  checks.push({ name: 'sources', ok: sources > 0, detail: `${boardCount} ATS boards, Foorilla ${config.discovery.foorilla ? 'enabled' : 'disabled'}` });
  checks.push({ name: 'dry-run', ok: config.dryRun, detail: config.dryRun ? 'enabled (safe)' : 'DISABLED (automatic Buffer publishing enabled)' });
  checks.push({ name: 'queue', ok: config.queueCapacity > config.reserve, detail: `capacity ${config.queueCapacity}, reserve ${config.reserve}` });
  checks.push({ name: 'ai-news', ok: !config.news.enabled || Boolean(config.deepseek.apiKey), detail: config.news.enabled ? `${config.news.queries.length} queries, ${config.news.maxPostsPerDay}/day, DeepSeek ${config.deepseek.apiKey ? 'configured' : 'MISSING'}` : 'disabled' });
  try {
    mkdirSync(dirname(config.databasePath), { recursive: true });
    accessSync(dirname(config.databasePath), constants.W_OK);
    db.prepare('SELECT 1').get();
    checks.push({ name: 'sqlite', ok: true, detail: config.databasePath });
  } catch (error) {
    checks.push({ name: 'sqlite', ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
  for (const network of ['x', 'linkedin'] as const) {
    checks.push({ name: `buffer-${network}`, ok: Boolean(config.buffer[network]), detail: config.buffer[network] ? 'channel id set' : 'channel id missing' });
  }
  for (const check of checks) process.stdout.write(`${check.ok ? 'OK  ' : 'WARN'} ${check.name}: ${check.detail}\n`);
  if (!checks.find(check => check.name === 'sqlite')?.ok) process.exitCode = 1;
}
