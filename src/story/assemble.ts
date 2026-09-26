import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { config } from '../config.js';
import { ffmpeg, ffprobe, writeConcatList } from './ffmpeg.js';
import { cuesToSrt } from './subtitles.js';
import type { Cue } from './types.js';

export async function normalizeSegment(inputPath: string, outputPath: string): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });
  await ffmpeg([
    '-i', inputPath,
    '-vf', `scale=${config.story.width}:${config.story.height}:force_original_aspect_ratio=decrease,pad=${config.story.width}:${config.story.height}:(ow-iw)/2:(oh-ih)/2,fps=${config.story.fps},format=yuv420p`,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

export async function assembleEpisode(input: {
  segmentPaths: string[];
  narrationPath: string;
  cues: Cue[];
  workDir: string;
}): Promise<{ mp4Path: string; srtPath: string; durationMs: number; width: number; height: number }> {
  if (!input.segmentPaths.length) throw new Error('Aucun segment vidéo à assembler');
  mkdirSync(input.workDir, { recursive: true });
  const normalized: string[] = [];
  for (const [index, path] of input.segmentPaths.entries()) {
    const probe = await ffprobe(path);
    if (!probe.hasVideo || probe.durationMs < 500) throw new Error(`Segment ${index} invalide ou trop court (${probe.durationMs}ms)`);
    const out = join(input.workDir, `norm-${String(index).padStart(3, '0')}.mp4`);
    await normalizeSegment(path, out);
    normalized.push(out);
  }
  const listPath = join(input.workDir, 'concat.txt');
  await writeConcatList(listPath, normalized);
  const concatPath = join(input.workDir, 'concat.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', concatPath]);
  const srtPath = join(input.workDir, 'episode.fr.srt');
  await writeFile(srtPath, cuesToSrt(input.cues));
  const silentMix = join(input.workDir, 'with-audio.mp4');
  await ffmpeg([
    '-i', concatPath,
    '-i', input.narrationPath,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-shortest',
    silentMix,
  ]);
  const mp4Path = join(input.workDir, 'episode.mp4');
  try {
    await ffmpeg([
      '-i', silentMix,
      '-vf', `subtitles=episode.fr.srt:force_style='FontName=DejaVu Sans,FontSize=18,Outline=1,Alignment=2'`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      mp4Path,
    ], input.workDir);
  } catch {
    await ffmpeg(['-i', silentMix, '-c', 'copy', '-movflags', '+faststart', mp4Path]);
  }
  const probe = await ffprobe(mp4Path);
  return { mp4Path, srtPath, durationMs: probe.durationMs, width: probe.width, height: probe.height };
}

export async function makeDryRunSegment(outputPath: string, seconds: number, label: string): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });
  const palette = ['0x1b3a4b', '0x4b2a1b', '0x1b4b2a', '0x3a1b4b', '0x4b4b1b'];
  const color = palette[Math.abs(label.length) % palette.length];
  await ffmpeg([
    '-f', 'lavfi',
    '-i', `color=c=${color}:s=${config.story.width}x${config.story.height}:d=${Math.max(1, seconds)}:r=${config.story.fps}`,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-t', String(Math.max(1, seconds)),
    outputPath,
  ]);
}

export async function makeDryRunNarration(outputPath: string, seconds: number): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });
  await ffmpeg([
    '-f', 'lavfi',
    '-i', `sine=frequency=220:sample_rate=32000:duration=${Math.max(1, seconds)}`,
    '-c:a', 'mp3',
    '-b:a', '64k',
    outputPath,
  ]);
}
