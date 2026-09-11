import { spawn } from 'node:child_process';
import { config } from '../config.js';
import pLimit from 'p-limit';

const limit = pLimit(config.story.ffmpegConcurrency);

export type ProbeInfo = {
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  hasVideo: boolean;
  codec?: string;
};

function run(bin: string, args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += String(chunk); });
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited ${code}: ${stderr.slice(-400)}`));
    });
  });
}

export async function ffmpeg(args: string[], cwd?: string): Promise<void> {
  await limit(async () => {
    await run(config.story.ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', '-threads', String(config.story.ffmpegThreads), ...args], cwd);
  });
}

export async function ffprobe(path: string): Promise<ProbeInfo> {
  const { stdout } = await run(config.story.ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height',
    '-of', 'json',
    path,
  ]);
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };
  const durationMs = Math.round(Number(parsed.format?.duration ?? 0) * 1000);
  const video = parsed.streams?.find(stream => stream.codec_type === 'video');
  const audio = parsed.streams?.find(stream => stream.codec_type === 'audio');
  return {
    durationMs,
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    codec: video?.codec_name,
  };
}

export async function extractLastFrame(videoPath: string, destPng: string): Promise<void> {
  await ffmpeg(['-sseof', '-0.05', '-i', videoPath, '-frames:v', '1', destPng]);
}

export async function writeConcatList(listPath: string, files: string[]): Promise<void> {
  const { writeFile } = await import('node:fs/promises');
  const body = files.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(listPath, `${body}\n`);
}
