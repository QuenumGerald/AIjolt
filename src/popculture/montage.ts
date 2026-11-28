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
import { bestContinuousRange, detectMotion, HIGHLIGHT_VERSION } from './highlights.js';

const exec = promisify(execFile);
const FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const VERSION = 'klieg-montage-v4';
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
  const useHighlights = config.montageHighlightsEnabled && video.durationSeconds != null && video.durationSeconds > duration + 8;
  const key = createHash('sha256').update(JSON.stringify([VERSION, HIGHLIGHT_VERSION, useHighlights, video.url, headline, duration])).digest('hex').slice(0, 24);
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
      let ranges = [{start:0,duration}];
      if (useHighlights) {
        const signals = await detectMotion(video.url!, video.durationSeconds!);
        if (!signals.length) throw new Error('no usable motion analysis');
        ranges = [bestContinuousRange(video.durationSeconds!,duration,signals)];
      }
      const fadeStart = Math.max(0, duration - 0.75).toFixed(2);
      const geometry = await exec('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height:stream_side_data=rotation','-of','json',video.url!],{timeout:20000});
      const source = JSON.parse(geometry.stdout).streams?.[0];
      if (!source?.width || !source?.height) throw new Error('source dimensions unavailable');
      const rotated = Math.abs(Number(source.side_data_list?.[0]?.rotation ?? 0)) % 180 === 90;
      const portrait = rotated ? source.width > source.height : source.height > source.width;
      const width = portrait ? 720 : 1280, height = portrait ? 1280 : 720;
      const fit = `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;
      const filters = [
        'fps=24',
        fit,
        'setsar=1',
        "drawbox=x=0:y=ih-170:w=iw:h=170:color=black@0.74:t=fill:enable='lt(t,5.5)'",
        `drawtext=fontfile=${FONT}:textfile=${textfile}:fontsize=${portrait ? 24 : 29}:line_spacing=8:fontcolor=white:x=24:y=h-152:expansion=none:enable='lt(t,5.5)'`,
        `drawtext=fontfile=${FONT}:text=KLIEG:fontsize=31:fontcolor=white:box=1:boxcolor=black@0.72:boxborderw=11:x=w-tw-28:y=30:expansion=none`,
        `fade=t=out:st=${fadeStart}:d=0.75`,
        'format=yuv420p',
      ].join(',');
      const audioProbe = await exec('ffprobe',[
        '-v','error','-show_entries','stream=codec_type','-of','csv=p=0',video.url!,
      ],{timeout:20_000,maxBuffer:100_000});
      const hasAudio = audioProbe.stdout.split(/\s+/).includes('audio');
      let renderInput = video.url!;
      if (useHighlights && ranges.length > 1) {
        // Sequential segment extraction prevents FFmpeg's concat filter from buffering
        // multiple full-resolution source streams inside the 600 MB service limit.
        const segments: string[] = [];
        for (let i=0;i<ranges.length;i++) {
          const segment=join(temporary!,`segment-${i}.mp4`);
          const range=ranges[i];
          await exec('ffmpeg',[
            '-nostdin','-hide_banner','-loglevel','error','-y',
            '-rw_timeout','25000000','-ss',String(range.start),'-i',video.url!,
            '-t',String(range.duration),'-map','0:v:0',...(hasAudio?['-map','0:a:0']:[]),
            '-vf',`fps=24,${fit},setsar=1,format=yuv420p`,
            '-threads','1','-c:v','libx264','-preset','veryfast','-crf','27',
            ...(hasAudio?['-c:a','aac','-b:a','128k','-ar','48000']:['-an']),
            '-movflags','+faststart',segment,
          ],{timeout:120_000,maxBuffer:500_000});
          segments.push(segment);
        }
        const concatFile=join(temporary!,'segments.txt');
        await writeFile(concatFile,segments.map(segment=>`file '${segment}'`).join('\n')+'\n',{mode:0o600});
        const joined=join(temporary!,'joined.mp4');
        await exec('ffmpeg',[
          '-nostdin','-hide_banner','-loglevel','error','-y',
          '-f','concat','-safe','0','-i',concatFile,'-c','copy','-movflags','+faststart',joined,
        ],{timeout:40_000,maxBuffer:500_000});
        renderInput=joined;
      }
      await exec('ffmpeg', [
        '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-rw_timeout', '25000000', '-ss', String(ranges.length===1 ? ranges[0].start : 0), '-i', renderInput,
        '-t', String(duration), '-map', '0:v:0', '-map', '0:a?',
        '-vf', filters, '-threads','1', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
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
    if (!metadata.streams?.some(track => track.codec_type === 'video' && track.codec_name === 'h264' && ((track.width === 1280 && track.height === 720) || (track.width === 720 && track.height === 1280)))) {
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
