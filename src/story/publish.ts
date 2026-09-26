import { basename } from 'node:path';
import { statSync } from 'node:fs';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { bufferCreateVideoPostPayload, bufferRequest, BufferRateLimitError, parseBufferCreateResponse, type BufferPostMetadata } from '../buffer.js';
import type { GmiClient } from '../gmi/client.js';
import type { StoryDestination } from './types.js';
import { captionFor, validateDestination, type MediaProbe } from './destinations.js';
import { ffprobe } from './ffmpeg.js';
import type { StoryStore } from './store.js';

export function publicUrlFor(path: string, already?: string | null): string | null {
  if (already) return already;
  const base = config.story.mediaPublicBaseUrl.replace(/\/$/, '');
  if (!base) return null;
  const rel = path.replace(/\\/g, '/');
  const file = basename(rel);
  return `${base}/${file}`;
}

export async function hostMp4(path: string, gmi: GmiClient, dryRun: boolean): Promise<string> {
  const existing = publicUrlFor(path);
  if (existing) return existing;
  if (dryRun) return `https://dry-run.invalid/${basename(path)}`;
  if (!config.story.hostViaGmiUpload) {
    throw new Error('Aucune URL publique pour le MP4. Configurez STORY_MEDIA_PUBLIC_BASE_URL (URL HTTPS stable, sans auth) ou STORY_HOST_VIA_GMI_UPLOAD=true pour utiliser l\'API d\'upload documentée de GMI (POST /api/v1/ie/requestqueue/apikey/upload-url). Buffer n\'accepte pas d\'upload de fichier.');
  }
  const uploaded = await gmi.upload(path, 'mp4');
  return uploaded.publicUrl;
}

function channelId(destination: StoryDestination): string | undefined {
  if (destination === 'tiktok') return config.buffer.tiktok;
  if (destination === 'instagram') return config.buffer.instagram;
  return config.buffer.youtube;
}

function metadataFor(destination: StoryDestination, title: string): BufferPostMetadata {
  if (destination === 'tiktok') return { tiktok: { isAiGenerated: true, title } };
  if (destination === 'instagram') return { instagram: { isAiGenerated: true, shouldShareToFeed: true } };
  return {
    youtube: {
      title,
      categoryId: config.buffer.youtubeCategoryId,
      isAiGenerated: true,
      madeForKids: false,
      privacy: config.buffer.youtubePrivacy,
      notifySubscribers: true,
    },
  };
}

export async function publishEpisode(input: {
  store: StoryStore;
  gmi: GmiClient;
  episodeId: number;
  destinations?: StoryDestination[];
  dryRun: boolean;
}): Promise<{ destination: StoryDestination; status: string; reason?: string; providerId?: string }[]> {
  const episode = input.store.getEpisode(input.episodeId);
  if (episode.status !== 'APPROVED') throw new Error(`Episode ${input.episodeId} must be APPROVED before publish (is ${episode.status})`);
  const mp4 = episode.outputMp4AssetId ? input.store.getAsset(episode.outputMp4AssetId) : null;
  if (!mp4?.path || mp4.status !== 'valid' || mp4.kind !== 'mp4') throw new Error('MP4 approuvé introuvable');
  if (episode.approvedAssetId !== mp4.id) throw new Error(`Le MP4 courant (${mp4.id}) n'est pas la version approuvée (${episode.approvedAssetId})`);
  const probe = await ffprobe(mp4.path);
  const bytes = statSync(mp4.path).size;
  const media: MediaProbe = {
    durationSeconds: probe.durationMs / 1000,
    width: probe.width,
    height: probe.height,
    bytes,
    format: 'mp4',
  };
  const destinations = input.destinations?.length ? input.destinations : config.story.destinations;
  const results: { destination: StoryDestination; status: string; reason?: string; providerId?: string }[] = [];
  let mediaUrl: string | null = mp4.publicUrl;

  for (const destination of destinations) {
    const existing = input.store.getPublication(input.episodeId, destination);
    if (existing?.status === 'queued' || existing?.status === 'published') {
      results.push({ destination, status: existing.status, providerId: existing.providerId ?? undefined, reason: 'already submitted' });
      continue;
    }
    if (existing?.status === 'pending') {
      results.push({ destination, status: 'pending', reason: 'Publication interrompue sans identifiant Buffer. Vérifiez Buffer manuellement; aucune resoumission automatique.' });
      continue;
    }
    const check = validateDestination(destination, media);
    if (!check.ok) {
      input.store.upsertPublication({ episodeId: input.episodeId, destination, status: 'blocked', error: check.reason, assetId: mp4.id });
      results.push({ destination, status: 'blocked', reason: check.reason });
      continue;
    }
    const channel = channelId(destination);
    const caption = captionFor(destination, episode.script?.title || `Épisode ${episode.id}`, episode.script?.logline || '');
    if (input.dryRun) {
      logger.info(`[DRY RUN] Buffer ${destination}: caption=${caption.slice(0, 80)} media=${media.durationSeconds.toFixed(1)}s`);
      results.push({ destination, status: 'dry-run' });
      continue;
    }
    if (!config.buffer.token) throw new Error('BUFFER_ACCESS_TOKEN is missing');
    if (!channel) {
      const reason = `BUFFER_${destination.toUpperCase()}_CHANNEL_ID manquant`;
      input.store.upsertPublication({ episodeId: input.episodeId, destination, status: 'failed', error: reason, assetId: mp4.id });
      results.push({ destination, status: 'failed', reason });
      continue;
    }
    if (!mediaUrl) {
      mediaUrl = await hostMp4(mp4.path, input.gmi, false);
      input.store.addAsset({ episodeId: input.episodeId, kind: 'mp4', path: mp4.path, publicUrl: mediaUrl, durationMs: mp4.durationMs, width: mp4.width, height: mp4.height, mime: mp4.mime, metadata: { ...mp4.metadata, hosted: true } });
    }
    input.store.upsertPublication({
      episodeId: input.episodeId,
      destination,
      status: 'pending',
      caption,
      mediaUrl,
      assetId: mp4.id,
    });
    try {
      const payload = bufferCreateVideoPostPayload({
        text: caption,
        channelId: channel,
        videoUrl: mediaUrl,
        thumbnailOffsetMs: 1000,
        metadata: metadataFor(destination, episode.script?.title || `Épisode ${episode.id}`),
      });
      const created = parseBufferCreateResponse(await bufferRequest(payload));
      input.store.upsertPublication({
        episodeId: input.episodeId,
        destination,
        status: 'queued',
        providerId: created.id,
        scheduledAt: created.dueAt ?? null,
        caption,
        mediaUrl,
        assetId: mp4.id,
        error: null,
      });
      logger.info(`Buffer scheduled ${destination} episode ${input.episodeId} as ${created.id}`);
      results.push({ destination, status: 'queued', providerId: created.id });
    } catch (error) {
      if (error instanceof BufferRateLimitError) {
        input.store.upsertPublication({ episodeId: input.episodeId, destination, status: 'failed', error: error.message, assetId: mp4.id });
        results.push({ destination, status: 'failed', reason: error.message });
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      input.store.upsertPublication({ episodeId: input.episodeId, destination, status: 'failed', error: message, assetId: mp4.id });
      results.push({ destination, status: 'failed', reason: message });
    }
  }
  return results;
}
