import 'dotenv/config';
import type { BoardConfig, Source } from './types.js';

const integer = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a positive number`);
  return value;
};
const list = (name: string): string[] => (process.env[name] ?? '').split(',').map((x: string) => x.trim()).filter(Boolean);
const defaultCountries = ['Austria','Australia','Belgium','Canada','Croatia','Cyprus','Czech Republic','Denmark','Estonia','Finland','France','Germany','Greece','Hungary','Iceland','India','Ireland','Israel','Italy','Japan','Latvia','Liechtenstein','Lithuania','Luxembourg','Malta','Netherlands','New Zealand','Norway','Poland','Portugal','Romania','Singapore','Slovakia','Slovenia','South Korea','Spain','Sweden','Switzerland','United Kingdom','United States'];
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
  boards: {
    greenhouse: boards('GREENHOUSE_BOARDS', 'greenhouse'),
    lever: boards('LEVER_SITES', 'lever'),
    ashby: boards('ASHBY_BOARDS', 'ashby'),
  },
  discovery: { foorilla: (process.env.FOORILLA_ENABLED ?? 'true').toLowerCase() !== 'false', pages: integer('FOORILLA_PAGES', 3), baseUrl: process.env.FOORILLA_BASE_URL ?? 'https://foorilla.com' },
  allowedCountries: new Set(list('ALLOWED_COUNTRIES').length ? list('ALLOWED_COUNTRIES') : defaultCountries),
  buffer: { token: process.env.BUFFER_ACCESS_TOKEN, x: process.env.BUFFER_X_CHANNEL_ID, linkedin: process.env.BUFFER_LINKEDIN_CHANNEL_ID },
};
