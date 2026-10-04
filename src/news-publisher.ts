import { config } from './config.js';
import { db, rowToNews } from './db.js';
import { logger } from './logger.js';
import { generateNewsPost } from './news-posts.js';
import { BufferRateLimitError, createBufferPost, dailyJobCount, dailyNewsCount, jobQueuedCount, newsQueuedCount, syncBufferPublications } from './publisher.js';
import { newsSlotsToday } from './queue-slots.js';

function newsLimit(): number {
  return newsSlotsToday({
    capacity: config.queueCapacity,
    reserve: config.reserve,
    jobQueued: jobQueuedCount('x'),
    newsQueued: newsQueuedCount('x'),
    jobsToday: dailyJobCount('x'),
    newsToday: dailyNewsCount(),
    maxNewsPerDay: config.news.maxPostsPerDay,
    maxXPostsPerDay: config.daily.xTotal,
    maxPerCycle: 1,
  });
}

export async function publishNews(dryRunFlag = false): Promise<void> {
  if (!config.news.enabled) {
    logger.info('AI news publishing is disabled (AI_NEWS_ENABLED=false)');
    return;
  }
  const dry = dryRunFlag || config.dryRun;
  if (!dry) await syncBufferPublications(false);
  if (!config.deepseek.apiKey) throw new Error('DEEPSEEK_API_KEY is required to publish AI news satire');

  const limit = newsLimit();
  if (!limit) {
    logger.info('No AI news post slot available today (news cap or shared X daily budget)');
    return;
  }
  const rows = db.prepare(`SELECT * FROM news_items n WHERE status='active' AND buzz_score >= ? AND published_at >= datetime('now', ?) AND NOT EXISTS (SELECT 1 FROM news_publications p WHERE p.news_id=n.id AND p.status IN ('published','queued')) ORDER BY buzz_score DESC,published_at DESC LIMIT ?`).all(config.news.minBuzzScore, `-${config.news.maxAgeHours} hours`, limit) as any[];

  for (const row of rows) {
    try {
      const text = await generateNewsPost(rowToNews(row));
      if (dry) {
        logger.info(`[DRY RUN] x AI news (${row.publisher}):\n${text}\nSource: ${row.url}`);
        continue;
      }
      if (!config.buffer.x) throw new Error('BUFFER_X_CHANNEL_ID is missing');
      if (!newsLimit()) {
        logger.info('Stopping AI news: daily news cap or shared X budget reached');
        return;
      }
      const post = await createBufferPost(text, config.buffer.x);
      db.prepare(`INSERT INTO news_publications(news_id,network,status,text,provider_id,created_at) VALUES(?,'x','queued',?,?,?) ON CONFLICT(news_id,network) DO UPDATE SET status='queued',text=excluded.text,provider_id=excluded.provider_id,error=NULL,created_at=excluded.created_at`).run(row.id, text, post.id, new Date().toISOString());
      logger.info(`Buffer scheduled AI news ${row.id} as ${post.id}${post.dueAt ? ` for ${post.dueAt}` : ''}`);
    } catch (error) {
      if (error instanceof BufferRateLimitError) {
        logger.warn(`${error.message}; stopping AI news publication cycle without marking additional posts failed`);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (!dry) db.prepare(`INSERT INTO news_publications(news_id,network,status,text,error,created_at) VALUES(?,'x','failed','',?,?) ON CONFLICT(news_id,network) DO UPDATE SET status='failed',error=excluded.error,created_at=excluded.created_at`).run(row.id, message, new Date().toISOString());
      logger.error(`AI news ${row.id} skipped: ${message}`);
    }
  }
}
