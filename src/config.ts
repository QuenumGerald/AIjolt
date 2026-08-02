import 'dotenv/config';

const integer = (name: string, fallback: number) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a positive number`);
  return value;
};
const list = (name: string): string[] => (process.env[name] ?? '').split(',').map((x: string) => x.trim()).filter(Boolean);
export const config = {
  dryRun: (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false',
  databasePath: process.env.DATABASE_PATH ?? './data/aijolt.db',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  collectInterval: integer('COLLECT_INTERVAL_MINUTES', 60), publishInterval: integer('PUBLISH_INTERVAL_MINUTES', 180),
  rps: integer('REQUESTS_PER_SECOND', 2), concurrency: integer('HTTP_CONCURRENCY', 3),
  daily: { x: integer('MAX_POSTS_PER_DAY_X', 2), linkedin: integer('MAX_POSTS_PER_DAY_LINKEDIN', 2) },
  reserve: integer('BUFFER_QUEUE_RESERVE', 2),
  boards: { greenhouse: list('GREENHOUSE_BOARDS'), lever: list('LEVER_SITES'), ashby: list('ASHBY_BOARDS') },
  buffer: { token: process.env.BUFFER_ACCESS_TOKEN, x: process.env.BUFFER_X_CHANNEL_ID, linkedin: process.env.BUFFER_LINKEDIN_CHANNEL_ID, baseUrl: process.env.BUFFER_API_BASE_URL },
};
