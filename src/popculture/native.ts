import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, stat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { assessVideo, isPublicHttpsUrl, X_NATIVE_MAX_BYTES, X_NATIVE_MAX_SECONDS } from './video.js';
import type { PopConfig } from './config.js';
import type { VideoAssessment } from './types.js';

const exec = promisify(execFile);

/** Check the actual file, following only public HTTPS redirects. Never trust an extension alone. */
export async function verifyNativeUrl(raw: string, redirects = 0): Promise<void> {
  if (!isPublicHttpsUrl(raw) || redirects > 5) throw new Error('invalid media URL or too many redirects');
  const response = await fetch(raw, { redirect: 'manual', headers: { Range: 'bytes=0-63' }, signal: AbortSignal.timeout(15_000) });
  try {
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('missing redirect target');
      await response.body?.cancel();
      return await verifyNativeUrl(new URL(location, raw).href, redirects + 1);
    }
    if (![200, 206].includes(response.status)) throw new Error(`media HTTP ${response.status}`);
    const type = response.headers.get('content-type')?.split(';')[0].trim();
    if (!['video/mp4', 'video/quicktime', 'video/x-m4v', 'application/octet-stream'].includes(type ?? '')) throw new Error('response is not a native video');
    const bytes = Number(response.headers.get('content-range')?.split('/')[1] ?? (response.status === 200 ? response.headers.get('content-length') : NaN));
    if (!Number.isFinite(bytes) || bytes <= 0 || bytes > X_NATIVE_MAX_BYTES) throw new Error('unknown or invalid media size');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('empty media response');
    try {
      let header = Buffer.alloc(0);
      while (header.length < 12) {
        const chunk = await reader.read();
        if (chunk.done) break;
        header = Buffer.concat([header, Buffer.from(chunk.value.subarray(0, 12 - header.length))]);
      }
      if (header.toString('ascii', 4, 8) !== 'ftyp') throw new Error('response is not an MP4/MOV file');
    } finally { await reader.cancel(); }
  } finally { if (!response.body?.locked) await response.body?.cancel().catch(() => {}); }
}

/** Download YouTube videos to an operator-owned HTTPS media directory. No expiring googlevideo URL is sent to Buffer. */
export async function materializeYouTube(video: VideoAssessment, config: PopConfig): Promise<VideoAssessment> {
  if (video.kind !== 'youtube-page' || !video.url || !config.mediaBaseUrl) return video;
  const page = new URL(video.url);
  if (!['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'].includes(page.hostname) || !isPublicHttpsUrl(video.url)) return video;
  const base = config.mediaBaseUrl.endsWith('/') ? config.mediaBaseUrl : `${config.mediaBaseUrl}/`;
  if (!isPublicHttpsUrl(base) || new URL(base).search || new URL(base).hash) throw new Error('POPCULTURE_MEDIA_BASE_URL must be a public HTTPS directory');
  const videoId = page.hostname === 'youtu.be' ? page.pathname.slice(1) : page.searchParams.get('v');
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) return video;
  const key = createHash('sha256').update(videoId).digest('hex').slice(0, 24);
  const directory = resolve(config.mediaDirectory);
  await mkdir(directory, { recursive: true });
  const file = join(directory, `${key}.mp4`);
  let downloaded = false;
  try {
    try { await stat(file); } catch {
      downloaded = true;
      await exec('yt-dlp', [
        '--ignore-config', '--no-playlist', '--no-progress', '--no-warnings',
        '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1',
        '--max-filesize', String(X_NATIVE_MAX_BYTES), '--match-filter', `duration <= ${X_NATIVE_MAX_SECONDS} & !is_live`,
        '-f', 'bv*[ext=mp4][height<=720][vcodec^=avc1]+ba[ext=m4a]/b[ext=mp4][height<=720][vcodec^=avc1]',
        '--merge-output-format', 'mp4', '-o', file, '--', `https://www.youtube.com/watch?v=${videoId}`,
      ], { timeout: 120_000, maxBuffer: 1_000_000 });
    }
    const info = await stat(file);
    const probe = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type', '-of', 'json', file], { timeout: 15_000 });
    const metadata = JSON.parse(probe.stdout) as { format?: { duration?: string }; streams?: Array<{ codec_type?: string; codec_name?: string }> };
    if (!metadata.streams?.some(s => s.codec_type === 'video' && s.codec_name === 'h264')) throw new Error('H.264 video track required');
    const duration = Number(metadata.format?.duration);
    const result = assessVideo({ url: new URL(`${key}.mp4`, base).href, mime: 'video/mp4', bytes: info.size, durationSeconds: duration, rights: video.rights });
    if (!result.attach) throw new Error(result.rejection);
    await verifyNativeUrl(result.url!);
    return result;
  } catch (error) {
    // Do not accumulate partial downloads or invalid files on failed runs.
    if (downloaded) {
      const { readdir } = await import('node:fs/promises');
      for (const name of await readdir(directory)) if (name.startsWith(`${key}.`)) await rm(join(directory, name), { force: true });
    }
    throw error;
  }
}
