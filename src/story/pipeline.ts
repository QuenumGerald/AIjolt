import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import pLimit from 'p-limit';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { estimateLlmUsd, type LlmClient } from '../llm.js';
import { extractMediaUrl, extractTtsTimestamps, isActiveGmiStatus, type GmiClient } from '../gmi/client.js';
import type { CharacterStyle, Episode, EpisodeScript, EpisodeTask } from './types.js';
import { StoryStore, hashText } from './store.js';
import { loadCharacterStyle, assertCharacterReady } from './character.js';
import { assertWithinBudget, requireRatesForLiveRun, ttsCostUsd, videoCostUsd } from './budget.js';
import { generateScript, planSegmentDurations, visualPromptForScene } from './script.js';
import { buildCues } from './subtitles.js';
import { assembleEpisode, makeDryRunNarration, makeDryRunSegment } from './assemble.js';
import { extractLastFrame, ffprobe } from './ffmpeg.js';

export type PipelineDeps = {
  store: StoryStore;
  llm: LlmClient;
  gmi: GmiClient;
  dryRun: boolean;
};

export type RunOptions = {
  pauseAfterScript?: boolean;
  retryFailed?: boolean;
};

function episodeDir(id: number): string {
  const dir = join(config.story.assetsDir, String(id));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function chunkText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const parts: string[] = [];
  let remaining = text.trim();
  while (remaining.length) {
    if (remaining.length <= maxChars) { parts.push(remaining); break; }
    let cut = remaining.lastIndexOf(' ', maxChars);
    if (cut < maxChars * 0.5) cut = maxChars;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  return parts;
}

export class StoryPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  private canReuse(task: EpisodeTask | null, inputHash: string, retryFailed: boolean): boolean {
    if (!task) return false;
    if (task.inputHash && task.inputHash !== inputHash) return false;
    if (task.status === 'succeeded') return true;
    if (task.status === 'failed' && retryFailed && task.attempts < config.story.maxAttempts) return false;
    if (['submitted', 'polling'].includes(task.status) && task.providerRequestId) return true;
    return false;
  }

  async run(episodeId: number, options: RunOptions = {}): Promise<Episode> {
    const { store } = this.deps;
    let episode = store.getEpisode(episodeId);
    if (episode.status === 'CANCELLED') throw new Error(`Episode ${episodeId} is CANCELLED`);
    if ((episode.status === 'REVIEW_READY' || episode.status === 'APPROVED') && store.latestValid(episode.id, 'mp4') && !options.retryFailed) {
      return episode;
    }
    requireRatesForLiveRun(this.deps.dryRun);
    assertWithinBudget(store, episodeId);
    const character = loadCharacterStyle();

    if (!episode.script) {
      episode = await this.generateScript(episode, character);
    }
    if (options.pauseAfterScript) return store.getEpisode(episodeId);
    assertCharacterReady(character, this.deps.dryRun);
    episode = store.setStatus(episodeId, 'GENERATING');
    const narration = await this.generateNarration(episode, options.retryFailed ?? false);
    const audioProbe = await ffprobe(narration.path!);
    this.assertNarrationDuration(episode, audioProbe.durationMs);
    const segments = await this.generateSegments(store.getEpisode(episodeId), character, audioProbe.durationMs, options.retryFailed ?? false);
    episode = store.setStatus(episodeId, 'ASSEMBLING');
    await this.assemble(store.getEpisode(episodeId), narration.path!, segments, audioProbe.durationMs);
    return store.setStatus(episodeId, 'REVIEW_READY');
  }

  async generateScriptOnly(episodeId: number): Promise<Episode> {
    const episode = this.deps.store.getEpisode(episodeId);
    const character = loadCharacterStyle();
    return this.generateScript(episode, character);
  }

  private async generateScript(episode: Episode, character: CharacterStyle): Promise<Episode> {
    const { store, llm, dryRun } = this.deps;
    const existing = store.findTask(episode.id, 'script');
    const inputHash = hashText(`${episode.note}|${episode.durationSeconds}|${character.name}|${character.description}`);
    if (existing?.status === 'succeeded' && episode.script && existing.inputHash === inputHash) return episode;
    requireRatesForLiveRun(dryRun);
    assertWithinBudget(store, episode.id);
    const task = store.upsertTask({ episodeId: episode.id, step: 'script', status: 'submitted', provider: 'deepseek', inputHash, incrementAttempts: true });
    if (!dryRun && task.attempts > config.story.maxAttempts) throw new Error(`Script: trop de tentatives (${task.attempts})`);
    try {
      const generated = await generateScript({
        note: episode.note,
        durationSeconds: episode.durationSeconds,
        character,
        llm,
        dryRun,
      });
      const saved = store.saveScript(episode.id, generated.script);
      const llmCost = generated.usage ? estimateLlmUsd(generated.usage) : { costKind: 'unknown' as const, usd: null };
      store.addUsage({
        episodeId: episode.id,
        taskId: task.id,
        provider: 'deepseek',
        kind: 'llm',
        costKind: llmCost.costKind,
        estimatedUsd: llmCost.usd,
        units: generated.usage ? (generated.usage.promptTokens ?? 0) + (generated.usage.completionTokens ?? 0) : null,
        unitKind: 'tokens',
      });
      store.upsertTask({ episodeId: episode.id, step: 'script', status: 'succeeded', provider: 'deepseek', inputHash });
      await writeFile(join(episodeDir(episode.id), 'script.json'), JSON.stringify(generated.script, null, 2));
      store.addAsset({ episodeId: episode.id, kind: 'script', path: join(episodeDir(episode.id), 'script.json'), mime: 'application/json', metadata: { model: generated.model, dryRun } });
      logger.info(`Episode ${episode.id}: script prêt (${generated.script.scenes.length} scènes, modèle ${generated.model})`);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.upsertTask({ episodeId: episode.id, step: 'script', status: 'failed', error: message, inputHash });
      store.setStatus(episode.id, 'FAILED', message);
      throw error;
    }
  }

  private assertNarrationDuration(episode: Episode, durationMs: number): void {
    const drift = Math.abs(durationMs / 1000 - episode.durationSeconds);
    if (drift > config.story.durationMaxDriftSeconds) {
      throw new Error(`Durée TTS ${ (durationMs / 1000).toFixed(1) }s incompatible avec la cible ${episode.durationSeconds}s (dérive ${drift.toFixed(1)}s > ${config.story.durationMaxDriftSeconds}s). Ajustez le script avant les générations vidéo. La narration n'a pas été tronquée.`);
    }
  }

  private async generateNarration(episode: Episode, retryFailed: boolean): Promise<{ path: string; durationMs: number; timestamps: unknown }> {
    const { store, gmi, dryRun } = this.deps;
    const script = episode.script!;
    const inputHash = hashText(`${episode.scriptHash}|${config.gmi.ttsModel}|${config.gmi.voiceId}|${script.narration}`);
    const existingAsset = store.latestValid(episode.id, 'narration');
    const task = store.findTask(episode.id, 'tts');
    if (existingAsset?.path && this.canReuse(task, inputHash, retryFailed) && task?.status === 'succeeded') {
      const probe = await ffprobe(existingAsset.path);
      logger.info(`Episode ${episode.id}: narration réutilisée (${probe.durationMs}ms)`);
      return { path: existingAsset.path, durationMs: probe.durationMs, timestamps: existingAsset.metadata.timestamps ?? null };
    }
    if (!dryRun && !config.gmi.voiceId) {
      throw new Error('GMI_TTS_VOICE_ID est requis. Aucun clonage de voix n\'est lancé sans échantillons et validation.');
    }
    if (task?.providerRequestId && (isActiveGmiStatus(task.status) || task.status === 'submitted' || task.status === 'polling')) {
      logger.info(`Episode ${episode.id}: reprise TTS request ${task.providerRequestId}`);
      return this.finishTts(episode, task.providerRequestId, inputHash);
    }
    const path = join(episodeDir(episode.id), 'narration.mp3');
    if (dryRun) {
      store.upsertTask({ episodeId: episode.id, step: 'tts', status: 'submitted', provider: 'dry-run', inputHash, incrementAttempts: true });
      await makeDryRunNarration(path, episode.durationSeconds);
      const probe = await ffprobe(path);
      store.addAsset({ episodeId: episode.id, kind: 'narration', path, durationMs: probe.durationMs, mime: 'audio/mpeg', metadata: { dryRun: true, alignment: 'duration-proportional' } });
      store.upsertTask({ episodeId: episode.id, step: 'tts', status: 'succeeded', provider: 'dry-run', inputHash });
      return { path, durationMs: probe.durationMs, timestamps: null };
    }
    const chunks = chunkText(script.narration, config.story.ttsMaxChars);
    if (chunks.length > 1) throw new Error(`Narration trop longue pour un seul appel TTS (${script.narration.length} caractères, max ${config.story.ttsMaxChars}). Raccourcissez le script; le découpage multi-requêtes n'est pas activé pour éviter des joints de voix.`);
    const cost = ttsCostUsd(script.narration.length);
    assertWithinBudget(store, episode.id, cost.usd);
    store.upsertTask({ episodeId: episode.id, step: 'tts', status: 'submitted', provider: 'gmi', inputHash, incrementAttempts: true });
    const submitted = await gmi.submit(config.gmi.ttsModel, {
      text: script.narration,
      voice_id: config.gmi.voiceId,
      speed: '1',
      vol: '1',
      pitch: '0',
      emotion: 'auto',
      language_boost: config.gmi.languageBoost,
      format: config.gmi.ttsFormat,
      audio_sample_rate: '32000',
      bitrate: '128000',
      channel: '2',
    });
    store.upsertTask({ episodeId: episode.id, step: 'tts', status: 'polling', provider: 'gmi', providerRequestId: submitted.request_id, inputHash });
    store.addUsage({
      episodeId: episode.id,
      taskId: store.findTask(episode.id, 'tts')?.id,
      provider: 'gmi',
      kind: 'tts',
      costKind: cost.costKind,
      estimatedUsd: cost.usd,
      units: script.narration.length,
      unitKind: 'characters',
      inFlight: true,
      providerRequestId: submitted.request_id,
    });
    return this.finishTts(episode, submitted.request_id, inputHash);
  }

  private async finishTts(episode: Episode, requestId: string, inputHash: string): Promise<{ path: string; durationMs: number; timestamps: unknown }> {
    const { store, gmi } = this.deps;
    const finished = await gmi.wait(requestId);
    store.clearInFlight(requestId);
    if (finished.status !== 'success') {
      const message = typeof finished.error === 'string' ? finished.error : finished.error?.message || `TTS status ${finished.status}`;
      store.upsertTask({ episodeId: episode.id, step: 'tts', status: 'failed', provider: 'gmi', providerRequestId: requestId, error: message, inputHash });
      throw new Error(message);
    }
    const url = extractMediaUrl(finished);
    if (!url) throw new Error('GMI TTS n\'a pas renvoyé d\'URL audio');
    const path = join(episodeDir(episode.id), 'narration.mp3');
    await gmi.download(url, path);
    const probe = await ffprobe(path);
    const timestamps = extractTtsTimestamps(finished);
    store.addAsset({
      episodeId: episode.id,
      kind: 'narration',
      path,
      publicUrl: url,
      durationMs: probe.durationMs,
      mime: 'audio/mpeg',
      metadata: { requestId, timestamps, alignment: timestamps ? 'tts-timestamps' : 'duration-proportional' },
    });
    store.upsertTask({ episodeId: episode.id, step: 'tts', status: 'succeeded', provider: 'gmi', providerRequestId: requestId, inputHash });
    return { path, durationMs: probe.durationMs, timestamps };
  }

  private async generateSegments(episode: Episode, character: CharacterStyle, audioDurationMs: number, retryFailed: boolean): Promise<string[]> {
    const { store, gmi, dryRun } = this.deps;
    const script = episode.script!;
    const durations = planSegmentDurations(audioDurationMs / 1000);
    const limit = pLimit(config.gmi.videoConcurrency);
    const paths: string[] = new Array(durations.length);
    let previousPublicUrl: string | undefined;
    let previousFrameUrl: string | undefined;

    for (let index = 0; index < durations.length; index += 1) {
      paths[index] = await limit(() => this.generateOneSegment({
        episode,
        character,
        script,
        index,
        durationSeconds: durations[index],
        retryFailed,
        previousPublicUrl,
        previousFrameUrl,
        dryRun,
        gmi,
        store,
      }));
      const asset = store.listAssets(episode.id, 'video_segment').find(item => item.metadata.segmentIndex === index);
      previousPublicUrl = asset?.publicUrl ?? previousPublicUrl;
      previousFrameUrl = typeof asset?.metadata.lastFrameUrl === 'string' ? asset.metadata.lastFrameUrl : previousFrameUrl;
    }
    return paths;
  }

  private async generateOneSegment(input: {
    episode: Episode;
    character: CharacterStyle;
    script: EpisodeScript;
    index: number;
    durationSeconds: number;
    retryFailed: boolean;
    previousPublicUrl?: string;
    previousFrameUrl?: string;
    dryRun: boolean;
    gmi: GmiClient;
    store: StoryStore;
  }): Promise<string> {
    const scene = input.script.scenes[Math.min(input.index, input.script.scenes.length - 1)];
    const prompt = visualPromptForScene(scene, input.character, input.index > 0 ? input.script.scenes[input.index - 1] : undefined);
    const inputHash = hashText(`${input.episode.scriptHash}|${input.index}|${prompt}|${input.durationSeconds}|${config.gmi.videoModel}`);
    const task = input.store.findTask(input.episode.id, 'video', input.index);
    const existing = input.store.listAssets(input.episode.id, 'video_segment').find(item => item.metadata.segmentIndex === input.index && item.status === 'valid');
    if (existing?.path && task?.status === 'succeeded' && task.inputHash === inputHash) {
      logger.info(`Episode ${input.episode.id}: segment ${input.index} réutilisé`);
      return existing.path;
    }
    const dest = join(episodeDir(input.episode.id), 'segments', `${String(input.index).padStart(3, '0')}.mp4`);
    mkdirSync(join(episodeDir(input.episode.id), 'segments'), { recursive: true });
    if (input.dryRun) {
      input.store.upsertTask({ episodeId: input.episode.id, step: 'video', segmentIndex: input.index, status: 'submitted', provider: 'dry-run', inputHash, incrementAttempts: true });
      await makeDryRunSegment(dest, input.durationSeconds, `s${input.index}`);
      input.store.addAsset({
        episodeId: input.episode.id,
        kind: 'video_segment',
        path: dest,
        durationMs: input.durationSeconds * 1000,
        width: config.story.width,
        height: config.story.height,
        mime: 'video/mp4',
        metadata: { segmentIndex: input.index, dryRun: true },
      });
      input.store.upsertTask({ episodeId: input.episode.id, step: 'video', segmentIndex: input.index, status: 'succeeded', provider: 'dry-run', inputHash });
      return dest;
    }
    if (task?.providerRequestId && (task.status === 'submitted' || task.status === 'polling')) {
      return this.finishSegment(input.episode, input.index, task.providerRequestId, dest, inputHash);
    }
    const cost = videoCostUsd(input.durationSeconds);
    if (cost.costKind === 'unknown' && !config.story.budgetAllowUnknown) {
      throw new Error('GMI_VIDEO_USD_PER_SECOND_720P manquant: impossible de respecter le budget vidéo');
    }
    assertWithinBudget(input.store, input.episode.id, cost.usd ?? 0);
    input.store.upsertTask({ episodeId: input.episode.id, step: 'video', segmentIndex: input.index, status: 'submitted', provider: 'gmi', inputHash, incrementAttempts: true });
    if ((input.store.findTask(input.episode.id, 'video', input.index)?.attempts ?? 0) > config.story.maxAttempts) {
      throw new Error(`Segment ${input.index}: trop de tentatives`);
    }
    const payload: Record<string, unknown> = {
      prompt,
      duration: Math.min(config.story.segmentMaxSeconds, Math.max(config.story.segmentMinSeconds, Math.round(input.durationSeconds))),
      resolution: config.story.resolution,
      ratio: config.story.ratio,
      watermark: false,
      generate_audio: config.story.generateVideoAudio,
      web_search: false,
    };
    if (input.character.referenceImageUrls.length) payload.reference_images = input.character.referenceImageUrls.slice(0, 9);
    if (input.character.avatarAssetIds.length) payload.avatar_asset_ids = input.character.avatarAssetIds;
    const videos = [input.previousPublicUrl, ...input.character.referenceVideoUrls].filter(Boolean).slice(0, 3);
    if (videos.length) payload.reference_videos = videos;
    if (input.previousFrameUrl) payload.first_frame = input.previousFrameUrl;
    const submitted = await input.gmi.submit(config.gmi.videoModel, payload);
    input.store.upsertTask({ episodeId: input.episode.id, step: 'video', segmentIndex: input.index, status: 'polling', provider: 'gmi', providerRequestId: submitted.request_id, inputHash });
    input.store.addUsage({
      episodeId: input.episode.id,
      taskId: input.store.findTask(input.episode.id, 'video', input.index)?.id,
      provider: 'gmi',
      kind: 'video',
      costKind: cost.costKind,
      estimatedUsd: cost.usd,
      units: input.durationSeconds,
      unitKind: 'seconds',
      inFlight: true,
      providerRequestId: submitted.request_id,
    });
    return this.finishSegment(input.episode, input.index, submitted.request_id, dest, inputHash);
  }

  private async finishSegment(episode: Episode, index: number, requestId: string, dest: string, inputHash: string): Promise<string> {
    const { store, gmi } = this.deps;
    const finished = await gmi.wait(requestId);
    store.clearInFlight(requestId);
    if (finished.status !== 'success') {
      const message = typeof finished.error === 'string' ? finished.error : finished.error?.message || `video status ${finished.status}`;
      store.upsertTask({ episodeId: episode.id, step: 'video', segmentIndex: index, status: 'failed', provider: 'gmi', providerRequestId: requestId, error: message, inputHash });
      throw new Error(`Segment ${index}: ${message}`);
    }
    const url = extractMediaUrl(finished);
    if (!url) throw new Error(`Segment ${index}: pas d'URL vidéo GMI`);
    await gmi.download(url, dest);
    const probe = await ffprobe(dest);
    if (!probe.hasVideo) throw new Error(`Segment ${index}: fichier sans piste vidéo`);
    let lastFrameUrl: string | undefined;
    try {
      const framePath = join(episodeDir(episode.id), 'segments', `${String(index).padStart(3, '0')}-last.png`);
      await extractLastFrame(dest, framePath);
      const uploaded = await gmi.upload(framePath, 'png');
      lastFrameUrl = uploaded.publicUrl;
    } catch (error) {
      logger.warn(`Episode ${episode.id}: frame de continuité indisponible pour le segment ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
    store.addAsset({
      episodeId: episode.id,
      kind: 'video_segment',
      path: dest,
      publicUrl: url,
      durationMs: probe.durationMs,
      width: probe.width,
      height: probe.height,
      mime: 'video/mp4',
      metadata: { segmentIndex: index, requestId, lastFrameUrl },
    });
    store.upsertTask({ episodeId: episode.id, step: 'video', segmentIndex: index, status: 'succeeded', provider: 'gmi', providerRequestId: requestId, inputHash });
    return dest;
  }

  private async assemble(episode: Episode, narrationPath: string, segmentPaths: string[], audioDurationMs: number): Promise<void> {
    const { store } = this.deps;
    const inputHash = hashText(`${episode.scriptHash}|${segmentPaths.join('|')}|${narrationPath}`);
    const existing = store.latestValid(episode.id, 'mp4');
    const task = store.findTask(episode.id, 'assemble');
    if (existing?.path && task?.status === 'succeeded' && task.inputHash === inputHash) {
      store.setOutputMp4(episode.id, existing.id);
      return;
    }
    store.upsertTask({ episodeId: episode.id, step: 'assemble', status: 'submitted', inputHash, incrementAttempts: true });
    const narrationAsset = store.latestValid(episode.id, 'narration');
    const cues = buildCues(episode.script!.narration, audioDurationMs, narrationAsset?.metadata.timestamps);
    const workDir = join(episodeDir(episode.id), 'assemble');
    try {
      const result = await assembleEpisode({ segmentPaths, narrationPath, cues, workDir });
      const srtAsset = store.addAsset({
        episodeId: episode.id,
        kind: 'subtitle',
        path: result.srtPath,
        mime: 'application/x-subrip',
        metadata: { alignment: cues[0]?.alignment ?? 'duration-proportional' },
      });
      const mp4 = store.addAsset({
        episodeId: episode.id,
        kind: 'mp4',
        path: result.mp4Path,
        durationMs: result.durationMs,
        width: result.width,
        height: result.height,
        mime: 'video/mp4',
        metadata: { srtAssetId: srtAsset.id, bytes: statSync(result.mp4Path).size },
      });
      store.setOutputMp4(episode.id, mp4.id);
      store.upsertTask({ episodeId: episode.id, step: 'assemble', status: 'succeeded', inputHash });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      store.upsertTask({ episodeId: episode.id, step: 'assemble', status: 'failed', error: message, inputHash });
      store.setStatus(episode.id, 'FAILED', message);
      throw error;
    }
  }
}
