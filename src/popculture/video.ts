import { isIP } from 'node:net';
import type { VideoAssessment, VideoKind } from './types.js';

/** Buffer support article, checked 20 Nov 2026: native X playback through Buffer is 0.5–140s and within 512 MB. Not verified by a live post. */
export const X_NATIVE_MIN_SECONDS = 0.5;
export const X_NATIVE_MAX_SECONDS = 140;
export const X_NATIVE_MAX_BYTES = 512 * 1024 * 1024;

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|metadata\.google\.internal)$/i;
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1|\[::1\]|172\.(1[6-9]|2\d|3[0-1])\.)/;

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  // Feeds and CDNs use named hosts; refuse all IP literals, including IPv6.
  return isIP(host) !== 0 || PRIVATE_HOST.test(host) || PRIVATE_IP.test(host) || host.endsWith('.internal');
}

export function isPublicHttpsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    if (url.port && url.port !== '443') return false;
    return !isBlockedHost(url.hostname);
  } catch {
    return false;
  }
}

export function classifyVideoReference(raw: string | null | undefined, mime?: string | null): VideoKind {
  if (!raw) return 'none';
  let url: URL;
  try { url = new URL(raw); } catch { return 'web-page'; }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const type = (mime ?? '').toLowerCase();
  if (host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com')) return 'youtube-page';
  if (type.includes('mpegurl') || path.endsWith('.m3u8')) return 'hls-playlist';
  if (type.startsWith('video/') || /\.(mp4|mov|m4v)$/.test(path)) return 'direct-file';
  return 'web-page';
}

export function jwMediaId(url: string): string | null {
  const match = url.match(/cdn\.jwplayer\.com\/(?:manifests|videos)\/([A-Za-z0-9]{8})/i)
    ?? url.match(/cdn\.jwplayer\.com\/v2\/media\/([A-Za-z0-9]{8})/i);
  return match?.[1] ?? null;
}

export function pickJwMp4(sources: Array<{ type?: string; file?: string; width?: number; filesize?: number }>): { url: string; mime: string; bytes: number | null } | null {
  const files = sources.filter(source => (source.type ?? '').startsWith('video/') && typeof source.file === 'string' && isPublicHttpsUrl(source.file));
  const ranked = files.sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  const chosen = ranked.find(source => (source.width ?? 0) <= 1280) ?? ranked[0];
  if (!chosen?.file) return null;
  return { url: chosen.file, mime: chosen.type || 'video/mp4', bytes: chosen.filesize ?? null };
}

/** Only native video files can be sent as Buffer assets. References must be resolved first. */
export function assessVideo(input: {
  url?: string | null;
  mime?: string | null;
  bytes?: number | null;
  durationSeconds?: number | null;
  stable?: boolean;
}): VideoAssessment {
  const kind = classifyVideoReference(input.url, input.mime);
  const url = input.url ?? null;
  const base = {
    kind,
    url,
    mime: input.mime ?? null,
    bytes: input.bytes ?? null,
    durationSeconds: input.durationSeconds ?? null,
    stable: input.stable ?? false,
    attach: false,
    rejection: 'no video in source',
  };
  if (kind === 'none' || !url) return base;
  if (!isPublicHttpsUrl(url)) {
    return { ...base, rejection: 'video URL is not public HTTPS' };
  }
  if (kind !== 'direct-file') return { ...base, rejection: 'native video file required' };
  if (input.bytes != null && (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > X_NATIVE_MAX_BYTES)) {
    return { ...base, rejection: 'video exceeds native file size limit or has invalid size' };
  }
  if (input.durationSeconds != null && (!Number.isFinite(input.durationSeconds) || input.durationSeconds < X_NATIVE_MIN_SECONDS || input.durationSeconds > X_NATIVE_MAX_SECONDS)) {
    return { ...base, rejection: 'video outside native duration limits' };
  }
  return {
    ...base,
    attach: true,
    stable: kind === 'direct-file',
    rejection: '',
  };
}
