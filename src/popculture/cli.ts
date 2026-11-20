import { spawnSync } from 'node:child_process';
import { POP_SOURCES } from './sources.js';
import { collectPop } from './collect.js';
import { popConfig, publishGate } from './config.js';
import { publishPop, showQueue } from './publish.js';

export async function popCollect(): Promise<void> {
  const result = await collectPop();
  console.log(`Collected ${result.collected} items (${result.ready} ready, ${result.withVideo} with video)`);
  for (const failure of result.failures) console.log(`source failed: ${failure}`);
}

export async function popQueue(status = 'ready'): Promise<void> {
  for (const line of showQueue(status === 'all' ? 'all' : status as 'ready', 30)) console.log(`${line}\n`);
}

export async function popPublish(dryRun: boolean): Promise<void> {
  for (const line of await publishPop(dryRun)) console.log(line);
}

export function popDoctor(): void {
  const config = popConfig();
  console.log(`database ${config.databasePath}`);
  console.log(`sources ${POP_SOURCES.length}; native video only`);
  console.log(`media directory ${config.mediaDirectory}`);
  console.log(config.mediaBaseUrl ? `media HTTPS ${config.mediaBaseUrl}` : 'YouTube download disabled: POPCULTURE_MEDIA_BASE_URL is not set');
  for (const command of ['yt-dlp', 'ffmpeg', 'ffprobe']) {
    const result = spawnSync(command, [command === 'yt-dlp' ? '--version' : '-version'], { timeout: 5000, stdio: 'ignore' });
    console.log(`${command} ${result.error ? 'missing' : 'installed'}`);
  }
  console.log(`dry-run ${config.dryRun}`);
  console.log(`publish-enabled ${config.publishEnabled}`);
  const gate = publishGate();
  console.log(gate.ok ? `channel ${gate.channelId}` : `publish blocked: ${gate.reason}`);
}
