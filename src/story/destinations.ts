import type { StoryDestination } from './types.js';

export type DestinationLimits = {
  destination: StoryDestination;
  maxDurationSeconds: number;
  minDurationSeconds: number;
  maxBytes: number;
  aspect: '9:16';
  formats: string[];
  minWidth: number;
  minHeight: number;
  source: string;
};

export const DESTINATION_LIMITS: Record<StoryDestination, DestinationLimits> = {
  tiktok: {
    destination: 'tiktok',
    maxDurationSeconds: 10 * 60,
    minDurationSeconds: 3,
    maxBytes: 1_000_000_000,
    aspect: '9:16',
    formats: ['mp4', 'mov', 'webm', 'm4v'],
    minWidth: 360,
    minHeight: 360,
    source: 'https://support.buffer.com/en-us/articles/sharing-videos-through-buffer-LOe2p2rnAI',
  },
  instagram: {
    destination: 'instagram',
    maxDurationSeconds: 15 * 60,
    minDurationSeconds: 3,
    maxBytes: 300_000_000,
    aspect: '9:16',
    formats: ['mp4', 'mov'],
    minWidth: 1,
    minHeight: 1,
    source: 'https://support.buffer.com/en-us/articles/sharing-videos-through-buffer-LOe2p2rnAI',
  },
  youtube: {
    destination: 'youtube',
    maxDurationSeconds: 3 * 60,
    minDurationSeconds: 1,
    maxBytes: 10_000_000_000,
    aspect: '9:16',
    formats: ['mp4', 'mov', 'mpg', 'mpeg', 'avi', 'webm', 'm4v'],
    minWidth: 1,
    minHeight: 1,
    source: 'https://support.buffer.com/en-us/articles/sharing-videos-through-buffer-LOe2p2rnAI',
  },
};

export type MediaProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  bytes: number;
  format: string;
};

export type DestinationCheck = {
  destination: StoryDestination;
  ok: boolean;
  reason?: string;
};

export function aspectIsNineSixteen(width: number, height: number): boolean {
  if (!width || !height) return false;
  return Math.abs(width / height - 9 / 16) < 0.02;
}

export function validateDestination(destination: StoryDestination, media: MediaProbe): DestinationCheck {
  const limits = DESTINATION_LIMITS[destination];
  if (media.durationSeconds > limits.maxDurationSeconds) {
    return {
      destination,
      ok: false,
      reason: `${destination} via Buffer refuse ${media.durationSeconds.toFixed(1)}s (max ${limits.maxDurationSeconds}s, ${limits.source}). L'épisode complet est conservé; cette destination est bloquée.`,
    };
  }
  if (media.durationSeconds < limits.minDurationSeconds) {
    return { destination, ok: false, reason: `${destination}: durée ${media.durationSeconds}s < minimum ${limits.minDurationSeconds}s` };
  }
  if (media.bytes > limits.maxBytes) {
    return { destination, ok: false, reason: `${destination}: fichier ${media.bytes} octets > ${limits.maxBytes}` };
  }
  if (!aspectIsNineSixteen(media.width, media.height)) {
    return { destination, ok: false, reason: `${destination}: ratio ${media.width}x${media.height} n'est pas 9:16` };
  }
  if (!limits.formats.includes(media.format)) {
    return { destination, ok: false, reason: `${destination}: format ${media.format} non accepté` };
  }
  if (media.width < limits.minWidth || media.height < limits.minHeight) {
    return { destination, ok: false, reason: `${destination}: résolution trop petite` };
  }
  return { destination, ok: true };
}

export function captionFor(destination: StoryDestination, title: string, logline: string): string {
  const base = `${title}\n${logline}`.trim();
  if (destination === 'tiktok') return base.slice(0, 150);
  if (destination === 'instagram') return base.slice(0, 2200);
  return base.slice(0, 5000);
}
