import 'dotenv/config';
import type { BoardConfig, Source } from './types.js';

const integer = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a positive number`);
  return value;
};
const list = (name: string): string[] => (process.env[name] ?? '').split(',').map((x: string) => x.trim()).filter(Boolean);
const defaultCountries = ['Albania','Andorra','Austria','Belarus','Belgium','Bosnia and Herzegovina','Bulgaria','Canada','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Iceland','Ireland','Italy','Kosovo','Latvia','Liechtenstein','Lithuania','Luxembourg','Malta','Moldova','Monaco','Montenegro','Mexico','Netherlands','North Macedonia','Norway','Poland','Portugal','Romania','Russia','San Marino','Serbia','Slovakia','Slovenia','Spain','Sweden','Switzerland','Turkey','Ukraine','United Kingdom','United States'];
const boards = (name: string, source: Source): BoardConfig[] => list(name).map(entry => {
  const [id, company = id] = entry.split('|').map(value => value.trim());
  if (!id) throw new Error(`${name} contains an empty board identifier`);
  return { source, id, company };
});
export const config = {
  dryRun: (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false',
  databasePath: process.env.DATABASE_PATH ?? './data/aijolt.db',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  collectInterval: integer('COLLECT_INTERVAL_MINUTES', 60), publishInterval: integer('PUBLISH_INTERVAL_MINUTES', 180),
  rps: integer('REQUESTS_PER_SECOND', 2), concurrency: integer('HTTP_CONCURRENCY', 3),
  daily: { x: integer('MAX_POSTS_PER_DAY_X', 2), linkedin: integer('MAX_POSTS_PER_DAY_LINKEDIN', 2) },
  reserve: integer('BUFFER_QUEUE_RESERVE', 2),
  queueCapacity: integer('BUFFER_QUEUE_CAPACITY', 10),
  bufferSyncMaxPosts: integer('BUFFER_SYNC_MAX_POSTS', 20),
  bufferSyncMinIntervalMinutes: integer('BUFFER_SYNC_MIN_INTERVAL_MINUTES', 15),
  boards: {
    greenhouse: boards('GREENHOUSE_BOARDS', 'greenhouse'),
    lever: boards('LEVER_SITES', 'lever'),
    ashby: boards('ASHBY_BOARDS', 'ashby'),
  },
  discovery: { foorilla: (process.env.FOORILLA_ENABLED ?? 'true').toLowerCase() !== 'false', pages: integer('FOORILLA_PAGES', 8), topics: list('FOORILLA_TOPICS').length ? list('FOORILLA_TOPICS') : ['101'], baseUrl: process.env.FOORILLA_BASE_URL ?? 'https://foorilla.com' },
  allowedCountries: new Set(list('ALLOWED_COUNTRIES').length ? list('ALLOWED_COUNTRIES') : defaultCountries),
  buffer: { token: process.env.BUFFER_ACCESS_TOKEN, x: process.env.BUFFER_X_CHANNEL_ID, linkedin: process.env.BUFFER_LINKEDIN_CHANNEL_ID },
  deepseek: { apiKey: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat' },
  news: {
    enabled: (process.env.AI_NEWS_ENABLED ?? 'true').toLowerCase() !== 'false',
    googleEnabled: (process.env.AI_NEWS_GOOGLE_ENABLED ?? 'true').toLowerCase() !== 'false',
    hackerNewsEnabled: (process.env.AI_NEWS_HN_ENABLED ?? 'true').toLowerCase() !== 'false',
    queries: list('AI_NEWS_QUERIES').length ? list('AI_NEWS_QUERIES') : ['OpenAI OR ChatGPT', 'Anthropic OR Claude', 'Google Gemini AI', 'AI model safety', 'AI model escaped sandbox'],
    allowedPublishers: new Set((list('AI_NEWS_ALLOWED_PUBLISHERS').length ? list('AI_NEWS_ALLOWED_PUBLISHERS') : ['Reuters','Associated Press','AP News','BBC','Bloomberg','Financial Times','TechCrunch','The Verge','Ars Technica','WIRED','MIT Technology Review']).map(value => value.toLowerCase())),
    allowedDomains: new Set((list('AI_NEWS_ALLOWED_DOMAINS').length ? list('AI_NEWS_ALLOWED_DOMAINS') : ['openai.com','anthropic.com','deepmind.google','blog.google','mistral.ai','ai.meta.com','x.ai','reuters.com','apnews.com','bbc.com','bloomberg.com','ft.com','techcrunch.com','theverge.com','arstechnica.com','wired.com','technologyreview.com']).map(value => value.toLowerCase())),
    maxAgeHours: integer('AI_NEWS_MAX_AGE_HOURS', 36),
    minBuzzScore: integer('AI_NEWS_MIN_BUZZ_SCORE', 35),
    maxPostsPerDay: integer('MAX_AI_NEWS_POSTS_PER_DAY_X', 8),
    queueCapacity: integer('AI_NEWS_BUFFER_QUEUE_CAPACITY', 50),
    maxLength: integer('AI_NEWS_MAX_LENGTH', 180),
    collectInterval: integer('AI_NEWS_COLLECT_INTERVAL_MINUTES', 30),
    publishInterval: integer('AI_NEWS_PUBLISH_INTERVAL_MINUTES', 120),
    includeSourceUrl: (process.env.AI_NEWS_INCLUDE_SOURCE_URL ?? 'false').toLowerCase() === 'true',
  },
};
