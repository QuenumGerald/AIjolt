import { config } from './config.js';
import { collectNewsSources } from './collectors/news.js';
import { db, upsertNews } from './db.js';
import { logger } from './logger.js';
import type { NewsItem } from './types.js';

export async function collectNews(): Promise<void> {
  if (!config.news.enabled) {
    logger.info('AI news collection is disabled (AI_NEWS_ENABLED=false)');
    return;
  }
  const run = db.prepare(`INSERT INTO runs(kind,status,started_at) VALUES('news-collect','running',?)`).run(new Date().toISOString());
  try {
    const items = await collectNewsSources();
    for (const item of items) upsertNews(item);
    db.prepare(`UPDATE news_items SET status='expired' WHERE status='active' AND published_at < datetime('now', ?)`).run(`-${config.news.maxAgeHours} hours`);
    db.prepare(`UPDATE runs SET status='success',details=?,finished_at=? WHERE id=?`).run(JSON.stringify({ accepted: items.length }), new Date().toISOString(), run.lastInsertRowid);
    logger.info(`AI news collection complete: ${items.length} trusted recent items`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.prepare(`UPDATE runs SET status='failed',details=?,finished_at=? WHERE id=?`).run(JSON.stringify({ error: message }), new Date().toISOString(), run.lastInsertRowid);
    throw error;
  }
}

export function addNewsItem(input: Omit<NewsItem, 'externalId' | 'source' | 'publishedAt'> & { publishedAt?: string }): void {
  if (!/^https?:\/\//i.test(input.url)) throw new Error('Manual AI news URL must use http or https');
  if (!Number.isFinite(input.buzzScore) || input.buzzScore < 0) throw new Error('Manual AI news buzz score must be a positive number');
  const publishedAt = input.publishedAt ? new Date(input.publishedAt).toISOString() : new Date().toISOString();
  const externalId = `manual-${Buffer.from(input.url).toString('base64url').slice(0, 32)}`;
  upsertNews({ ...input, externalId, source: 'manual', publishedAt });
  logger.info(`Added manual AI news item: ${input.title}`);
}
