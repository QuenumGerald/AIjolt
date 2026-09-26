import { accessSync, constants, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';
import { db } from './db.js';

export function doctor(): void {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const boardCount = config.boards.greenhouse.length + config.boards.lever.length + config.boards.ashby.length;
  const sources = boardCount + (config.discovery.foorilla ? 1 : 0);
  checks.push({ name: 'sources', ok: sources > 0, detail: `${boardCount} ATS boards, Foorilla ${config.discovery.foorilla ? 'enabled' : 'disabled'}` });
  checks.push({ name: 'jobs-pipeline', ok: !config.jobsPipelineEnabled, detail: config.jobsPipelineEnabled ? 'ENABLED (collecte/scoring/publish offres actifs)' : 'disabled' });
  checks.push({ name: 'dry-run', ok: config.dryRun, detail: config.dryRun ? 'enabled (safe)' : 'DISABLED (appels payants et Buffer autorisés)' });
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
  for (const network of ['tiktok', 'instagram', 'youtube'] as const) {
    checks.push({ name: `buffer-${network}`, ok: Boolean(config.buffer[network]), detail: config.buffer[network] ? 'channel id set' : 'channel id missing' });
  }
  checks.push({ name: 'gmi', ok: config.dryRun || Boolean(config.gmi.apiKey), detail: config.gmi.apiKey ? `models ${config.gmi.videoModel} / ${config.gmi.ttsModel}` : 'GMI_API_KEY missing (required unless DRY_RUN)' });
  checks.push({ name: 'tts-voice', ok: config.dryRun || Boolean(config.gmi.voiceId), detail: config.gmi.voiceId ? 'GMI_TTS_VOICE_ID set' : 'missing (no voice clone will be started automatically)' });
  checks.push({ name: 'llm-script', ok: config.dryRun || Boolean(config.deepseek.apiKey), detail: `DeepSeek ${config.deepseek.model}${config.deepseek.apiKey ? '' : ' key missing'}` });
  for (const check of checks) process.stdout.write(`${check.ok ? 'OK  ' : 'WARN'} ${check.name}: ${check.detail}\n`);
  if (!checks.find(check => check.name === 'sqlite')?.ok) process.exitCode = 1;
}
