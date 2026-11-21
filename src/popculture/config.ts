/** Documented in MEVRIC.md on the mevric branch. Never a default for this project. */
export const MEVRIC_X_CHANNEL_ID = '6aea10f0e29c69a1714d0a21';

export type PopEnv = Record<string, string | undefined>;

const integer = (env: PopEnv, name: string, fallback: number): number => {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
};

const flag = (env: PopEnv, name: string, fallback: boolean): boolean => {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  return raw === 'true';
};

export type PopConfig = {
  databasePath: string;
  dryRun: boolean;
  publishEnabled: boolean;
  bufferToken: string | undefined;
  channelId: string | undefined;
  maxAgeHours: number;
  maxPostsPerDay: number;
  maxPerCycle: number;
  postSpacingMinutes: number;
  minScore: number;
  mediaDirectory: string;
  mediaBaseUrl: string | undefined;
  maxVideoDownloads: number;
  maxDirectClipsPerCycle: number;
};

export function popConfig(env: PopEnv = process.env): PopConfig {
  return {
    databasePath: env.POPCULTURE_DATABASE_PATH?.trim() || './data/popculture.db',
    dryRun: flag(env, 'POPCULTURE_DRY_RUN', true),
    publishEnabled: flag(env, 'POPCULTURE_PUBLISH_ENABLED', false),
    bufferToken: env.POPCULTURE_BUFFER_ACCESS_TOKEN?.trim() || undefined,
    channelId: env.POPCULTURE_BUFFER_X_CHANNEL_ID?.trim() || undefined,
    maxAgeHours: integer(env, 'POPCULTURE_MAX_AGE_HOURS', 36),
    // Explicit 0 means unlimited; Buffer/X can still apply platform-side restrictions.
    maxPostsPerDay: integer(env, 'POPCULTURE_MAX_POSTS_PER_DAY', 48),
    maxPerCycle: Math.max(1, integer(env, 'POPCULTURE_MAX_PER_CYCLE', 1)),
    // Temporary fast mode must expire even if the scheduled configuration revert fails.
    postSpacingMinutes: (() => {
      const requested = Math.max(1, integer(env, 'POPCULTURE_POST_SPACING_MINUTES', 30));
      const fastUntil = env.POPCULTURE_FAST_MODE_UNTIL_UTC?.trim();
      if (fastUntil && requested < 30) {
        const deadline = Date.parse(fastUntil);
        if (!Number.isFinite(deadline)) throw new Error('POPCULTURE_FAST_MODE_UNTIL_UTC must be an ISO date');
        if (Date.now() >= deadline) return 30;
      }
      return requested;
    })(),
    minScore: integer(env, 'POPCULTURE_MIN_SCORE', 45),
    mediaDirectory: env.POPCULTURE_MEDIA_DIRECTORY?.trim() || './data/popculture-media',
    mediaBaseUrl: env.POPCULTURE_MEDIA_BASE_URL?.trim() || undefined,
    maxVideoDownloads: integer(env, 'POPCULTURE_MAX_VIDEO_DOWNLOADS', 8),
    maxDirectClipsPerCycle: integer(env, 'POPCULTURE_MAX_DIRECT_CLIPS_PER_CYCLE', 3),
  };
}

export function channelGuard(channelId: string | undefined, env: PopEnv = process.env): { ok: true; channelId: string } | { ok: false; reason: string } {
  const id = channelId?.trim() ?? '';
  if (!id) return { ok: false, reason: 'POPCULTURE_BUFFER_X_CHANNEL_ID is not set' };
  const blocked: Array<[string, string | undefined]> = [
    ['Nox BUFFER_X_CHANNEL_ID', env.BUFFER_X_CHANNEL_ID],
    ['BUFFER_LINKEDIN_CHANNEL_ID', env.BUFFER_LINKEDIN_CHANNEL_ID],
    ['MEVRIC X channel', MEVRIC_X_CHANNEL_ID],
  ];
  for (const [name, value] of blocked) {
    if (value?.trim() && id === value.trim()) return { ok: false, reason: `channel id matches ${name}` };
  }
  return { ok: true, channelId: id };
}

export function publishGate(env: PopEnv = process.env): { ok: true; channelId: string; token: string } | { ok: false; reason: string } {
  const config = popConfig(env);
  if (!config.publishEnabled) return { ok: false, reason: 'POPCULTURE_PUBLISH_ENABLED is not true' };
  if (config.dryRun) return { ok: false, reason: 'POPCULTURE_DRY_RUN is true' };
  if (!config.bufferToken) return { ok: false, reason: 'POPCULTURE_BUFFER_ACCESS_TOKEN is not set' };
  const channel = channelGuard(config.channelId, env);
  if (!channel.ok) return channel;
  return { ok: true, channelId: channel.channelId, token: config.bufferToken };
}
