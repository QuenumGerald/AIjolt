import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, stat, rename, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { PopConfig } from './config.js';
import type { VideoAssessment } from './types.js';
import { cleanTitle } from './posts.js';
import { verifyNativeUrl } from './native.js';
import { assessVideo, isPublicHttpsUrl, X_NATIVE_MAX_BYTES } from './video.js';

const exec = promisify(execFile);
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const VERSION = 'klieg-montage-v1';
export const MONTAGE_MAX_SECONDS = 60;

/** Lower-third copy only. The original full headline remains in the X post. */
export function montageHeadline(title: string): string {
  const text = cleanTitle(title).replace(/[\x00-\x1f\x7f]/g, ' ').trim();
  if (!text) return 'KLIEG VIDEO';
  const words = text.split(/\s+/);
  const lines: string[] = [''];
  for (const word of words) {
    let value = word;
    while (value.length > 43) {
      value = `${value.slice(0, 42)}…`;
      break;
    }
    const idx = lines.length - 1;
    const combined = lines[idx] ? `${lines[idx]} ${value}` : value;
    if (combined.length > 43 && lines[idx]) {
      if (lines.length === 2) {
        if (!lines[1].endsWith('…')) lines[1] = `${lines[1].slice(0, 42)}…`;
        break;
      }
      lines.push(value);
    } else {
      lines[idx] = combined;
    }
  }
  return lines.join('\n');
}

/** Short, reproducible, locally hosted edit. Never edits source footage or the source record. */
export async function renderKliegMontage(
  video: VideoAssessment,
  headline: string,
  config: PopConfig,
): Promise<VideoAssessment> {
  if (!config.montageEnabled) return video;
  if (!video.attach || !video.url || !isPublicHttpsUrl(video.url)) throw new Error('native HTTPS source video required');
  if (!config.mediaBaseUrl) throw new Error('Klieg media HTTPS hosting is not configured');
  const base = new URL(config.mediaBaseUrl.endsWith('/') ? config.mediaBaseUrl : `${config.mediaBaseUrl}/`);
  if (!isPublicHttpsUrl(base.href) || base.search || base.hash) throw new Error('invalid Klieg media base URL');
  const duration = video.durationSeconds != null && video.durationSeconds > 0
    ? Math.min(video.durationSeconds, config.montageSeconds)
    : config.montageSeconds;
  if (duration < 0.5) throw new Error('video too short to edit');
  const key = createHash('sha256').update(JSON.stringify([VERSION, video.url, headline, duration])).digest('hex').slice(0, 24);
  const filename = `klieg-edit-${key}.mp4`;
  const directory = resolve(config.mediaDirectory);
  const file = join(directory, filename);
  const partial = join(directory, `klieg-edit-${key}.part.mp4`);
  const url = new URL(filename, base).href;
  if (basename(file) !== filename) throw new Error('invalid output filename');
  await mkdir(directory, {recursive:true});
  let temporary: string | undefined;
  let created = false;
  try {
    try { await stat(file); }
    catch {
      created = true;
      await verifyNativeUrl(video.url);
      temporary = await mkdtemp(join(tmpdir(), 'klieg-montage-'));
      const textfile = join(temporary, 'headline.txt');
      await writeFile(textfile, montageHeadline(headline), {mode:0o600});
      const fadeStart = Math.max(0, duration - 0.75).toFixed(2);
      const filters = [
        'fps=24',
        'scale=1280:720:force_original_aspect_ratio=decrease:flags=bicubic',
        'pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black',
        'setsar=1',
        "drawbox=x=0:y=550:w=1280:h=170:color=black@0.74:t=fill:enable='lt(t,5.5)'",
        `drawtext=fontfile=${FONT}:textfile=${textfile}:fontsize=29:line_spacing=8:fontcolor=white:x=36:y=568:expansion=none:enable='lt(t,5.5)'`,
        `drawtext=fontfile=${FONT}:text=KLIEG:fontsize=31:fontcolor=white:box=1:boxcolor=black@0.72:boxborderw=11:x=w-tw-28:y=30:expansion=none`,
        `fade=t=out:st=${fadeStart}:d=0.75`,
        'format=yuv420p',
      ].join(',');
      await exec('ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-rw_timeout', '25000000', '-i', video.url,
        '-t', String(duration), '-map', '0:v:0', '-map', '0:a?',
        '-vf', filters, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
        '-maxrate', '3000k', '-bufsize', '6000k', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
        '-movflags', '+faststart', '-map_metadata', '-1',
        partial,
      ], {timeout:240_000, maxBuffer:500_000});
    }
    const [info, probe] = await Promise.all([
      stat(created ? partial : file),
      exec('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type,width,height',
        '-of', 'json', created ? partial : file,
      ], {timeout:15_000}),
    ]);
    const metadata = JSON.parse(probe.stdout) as {
      format?: {duration?: string};
      streams?: Array<{codec_type?:string;codec_name?:string;width?:number;height?:number}>;
    };
    if (!metadata.streams?.some(track => track.codec_type === 'video' && track.codec_name === 'h264' && track.width === 1280 && track.height === 720)) {
      throw new Error('edited output must be 720p H.264');
    }
    if (metadata.streams.some(track => track.codec_type === 'audio' && track.codec_name !== 'aac')) throw new Error('edited audio must be AAC');
    const seconds = Number(metadata.format?.duration);
    if (!Number.isFinite(seconds) || seconds < 0.5 || seconds > MONTAGE_MAX_SECONDS + 0.5) throw new Error('edited video duration invalid');
    if (info.size <= 0 || info.size > X_NATIVE_MAX_BYTES) throw new Error('edited video size invalid');
    if (created) await rename(partial, file);
    await chmod(file, 0o644);
    const edited = assessVideo({url,mime:'video/mp4',bytes:info.size,durationSeconds:seconds});
    if (!edited.attach) throw new Error('edited video rejected by native checks');
    await verifyNativeUrl(url);
    return edited;
  } catch (error) {
    if (created) {
      await rm(partial, {force:true}).catch(() => {});
      await rm(file, {force:true}).catch(() => {});
    }
    throw error;
  } finally {
    if (temporary) await rm(temporary, {recursive:true,force:true}).catch(() => {});
  }
}
