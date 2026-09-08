import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDb } from '../src/db.js';
import { config } from '../src/config.js';
import { StoryStore, minutesToSeconds } from '../src/story/store.js';
import { assertTransition } from '../src/story/states.js';
import { StoryPipeline } from '../src/story/pipeline.js';
import { publishEpisode } from '../src/story/publish.js';
import { validateDestination } from '../src/story/destinations.js';
import { bufferCreateVideoPostPayload } from '../src/buffer.js';
import { planSegmentDurations } from '../src/story/script.js';
import { buildCues, cuesToSrt, proportionalCues } from '../src/story/subtitles.js';
import { assembleEpisode, makeDryRunNarration, makeDryRunSegment } from '../src/story/assemble.js';
import { BudgetError, assertWithinBudget } from '../src/story/budget.js';
import type { GmiClient, GmiRequest } from '../src/gmi/client.js';
import type { LlmClient } from '../src/llm.js';
import type { EpisodeScript } from '../src/story/types.js';

const throwingLlm: LlmClient = {
  async complete() { throw new Error('LLM should not be called in DRY_RUN'); },
};

function throwingGmi(): GmiClient {
  const fail = async () => { throw new Error('GMI should not be called in DRY_RUN'); };
  return { submit: fail, get: fail, wait: fail, upload: fail, download: fail };
}

function sampleScript(durationSeconds: number): EpisodeScript {
  const durations = planSegmentDurations(durationSeconds);
  return {
    title: 'Le bus de minuit',
    logline: 'Un trajet trop réel pour rester un souvenir.',
    narration: 'La station était presque vide. Je suis monté quand même. Le bus a redémarré avant que je comprenne la destination.',
    language: 'fr',
    scenes: durations.map((duration, index) => ({
      index,
      durationSeconds: duration,
      narration: `Scène ${index + 1}.`,
      visualPrompt: `Le personnage marche, plan ${index + 1}, 3D stylisée.`,
      location: 'station',
      outfit: 'manteau sombre',
      continuityNotes: 'même manteau',
    })),
  };
}

describe('durées autorisées', () => {
  it('accepte 30 secondes, 2, 3 et 5 minutes', () => {
    expect(minutesToSeconds(0.5)).toBe(30);
    expect(minutesToSeconds(2)).toBe(120);
    expect(minutesToSeconds(3)).toBe(180);
    expect(minutesToSeconds(5)).toBe(300);
    expect(() => minutesToSeconds(4)).toThrow(/2, 3 or 5/);
    expect(() => minutesToSeconds(1)).toThrow();
  });
});

describe('transitions d\'état', () => {
  it('autorise le parcours nominal et refuse les sauts', () => {
    expect(() => assertTransition('DRAFT', 'SCRIPT_READY')).not.toThrow();
    expect(() => assertTransition('SCRIPT_READY', 'GENERATING')).not.toThrow();
    expect(() => assertTransition('GENERATING', 'ASSEMBLING')).not.toThrow();
    expect(() => assertTransition('ASSEMBLING', 'REVIEW_READY')).not.toThrow();
    expect(() => assertTransition('REVIEW_READY', 'APPROVED')).not.toThrow();
    expect(() => assertTransition('DRAFT', 'APPROVED')).toThrow(/Invalid episode transition/);
    expect(() => assertTransition('APPROVED', 'GENERATING')).toThrow();
  });
});

describe('store et script', () => {
  const db = createDb(':memory:');
  const store = new StoryStore(db);

  it('invalide les assets dépendants et l\'approbation si le script change', () => {
    const episode = store.createEpisode('une note', 120);
    store.saveScript(episode.id, sampleScript(120));
    store.setStatus(episode.id, 'GENERATING');
    const narration = store.addAsset({ episodeId: episode.id, kind: 'narration', path: '/tmp/a.mp3' });
    expect(narration.status).toBe('valid');
    const updated = store.saveScript(episode.id, { ...sampleScript(120), narration: 'texte modifié.' });
    expect(updated.status).toBe('SCRIPT_READY');
    expect(updated.approvedAssetId).toBeNull();
    expect(store.getAsset(narration.id).status).toBe('invalid');
  });
});

describe('budget', () => {
  it('refuse un dépassement de plafond épisode', () => {
    const db = createDb(':memory:');
    const store = new StoryStore(db);
    const episode = store.createEpisode('note', 120);
    store.addUsage({ episodeId: episode.id, provider: 'gmi', kind: 'video', costKind: 'estimated', estimatedUsd: config.story.budgetEpisodeUsd ?? 20 });
    expect(() => assertWithinBudget(store, episode.id, 1)).toThrow(BudgetError);
  });
});

describe('Buffer vidéo et destinations', () => {
  it('envoie un asset video.url, pas un upload Buffer', () => {
    const payload = bufferCreateVideoPostPayload({
      text: 'caption',
      channelId: 'chan',
      videoUrl: 'https://example.com/episode.mp4',
      metadata: { youtube: { title: 'Titre', categoryId: '24', isAiGenerated: true } },
    });
    expect(payload.query).toContain('assets: $assets');
    expect(payload.variables.assets[0].video.url).toBe('https://example.com/episode.mp4');
    expect(payload.query).not.toMatch(/upload/i);
  });

  it('bloque YouTube à 5 minutes et laisse TikTok/Instagram passer', () => {
    const media = { durationSeconds: 300, width: 720, height: 1280, bytes: 20_000_000, format: 'mp4' };
    expect(validateDestination('youtube', media).ok).toBe(false);
    expect(validateDestination('youtube', media).reason).toMatch(/conservé/);
    expect(validateDestination('tiktok', media).ok).toBe(true);
    expect(validateDestination('instagram', media).ok).toBe(true);
  });
});

describe('sous-titres', () => {
  it('utilise les timestamps TTS s\'ils existent, sinon un alignement proportionnel explicite', () => {
    const timed = buildCues('Bonjour. Suite.', 2000, [{ text: 'Bonjour.', start_ms: 0, end_ms: 800 }, { text: 'Suite.', start_ms: 800, end_ms: 2000 }]);
    expect(timed[0].alignment).toBe('tts-timestamps');
    const proportional = proportionalCues('Bonjour. Suite.', 2000);
    expect(proportional.every(cue => cue.alignment === 'duration-proportional')).toBe(true);
    expect(cuesToSrt(proportional)).toContain('-->');
  });
});

describe('reprise et double soumission', () => {
  it('ne resoumet pas une requête GMI TTS déjà en cours et réutilise le MP4 ensuite', async () => {
    const db = createDb(':memory:');
    const store = new StoryStore(db);
    const episode = store.createEpisode('note de test', 120);
    store.saveScript(episode.id, sampleScript(120));
    store.upsertTask({
      episodeId: episode.id,
      step: 'tts',
      status: 'polling',
      provider: 'gmi',
      providerRequestId: 'req-tts-1',
    });
    let ttsSubmits = 0;
    let videoSubmits = 0;
    const original = {
      voiceId: config.gmi.voiceId,
      videoRate: config.gmi.usdPerSecond720p,
      inRate: config.deepseek.usdPer1kInputTokens,
      outRate: config.deepseek.usdPer1kOutputTokens,
      width: config.story.width,
      height: config.story.height,
      fps: config.story.fps,
      assets: config.story.assetsDir,
      refs: config.story.referenceImageUrls,
      name: config.story.characterName,
      description: config.story.characterDescription,
    };
    config.gmi.voiceId = 'French_test_voice';
    config.gmi.usdPerSecond720p = 0.1;
    config.deepseek.usdPer1kInputTokens = 0.001;
    config.deepseek.usdPer1kOutputTokens = 0.002;
    config.story.width = 90;
    config.story.height = 160;
    config.story.fps = 8;
    config.story.assetsDir = mkdtempSync(join(tmpdir(), 'aijolt-story-'));
    config.story.referenceImageUrls = ['https://example.com/character.png'];
    config.story.characterName = 'Alex';
    config.story.characterDescription = 'Personnage 3D stylisé';
    const gmi: GmiClient = {
      async submit(model) {
        if (model.includes('tts')) { ttsSubmits += 1; throw new Error('TTS already in flight'); }
        videoSubmits += 1;
        return { request_id: `req-v-${videoSubmits}`, model, status: 'queued' };
      },
      async get(id) {
        if (id === 'req-tts-1') {
          return {
            request_id: id,
            model: 'minimax-tts-speech-2.8-hd',
            status: 'success',
            outcome: { media_urls: [{ id: '0', url: 'https://example.com/n.mp3' }] },
          } satisfies GmiRequest;
        }
        return { request_id: id, model: 'seedance-2-5-260628', status: 'success', outcome: { video_url: 'https://example.com/s.mp4' } };
      },
      async wait(id) { return this.get(id); },
      async upload() { return { publicUrl: 'https://example.com/frame.png' }; },
      async download(_url, dest) {
        if (dest.endsWith('.mp3')) await makeDryRunNarration(dest, 120);
        else if (dest.endsWith('.png')) { await import('node:fs/promises').then(fs => fs.writeFile(dest, Buffer.from('png'))); }
        else await makeDryRunSegment(dest, 2, 'seg');
      },
    };
    try {
      const live = new StoryPipeline({ store, llm: throwingLlm, gmi, dryRun: false });
      await live.run(episode.id);
      expect(ttsSubmits).toBe(0);
      const afterFirst = videoSubmits;
      expect(afterFirst).toBeGreaterThan(0);
      await live.run(episode.id);
      expect(videoSubmits).toBe(afterFirst);
      expect(ttsSubmits).toBe(0);
    } finally {
      config.gmi.voiceId = original.voiceId;
      config.gmi.usdPerSecond720p = original.videoRate;
      config.deepseek.usdPer1kInputTokens = original.inRate;
      config.deepseek.usdPer1kOutputTokens = original.outRate;
      config.story.width = original.width;
      config.story.height = original.height;
      config.story.fps = original.fps;
      config.story.assetsDir = original.assets;
      config.story.referenceImageUrls = original.refs;
      config.story.characterName = original.name;
      config.story.characterDescription = original.description;
    }
  }, 120_000);
});

describe('DRY_RUN bout en bout', () => {
  it('va de la note au MP4 sans appels externes, exige l\'approbation, et évite la double publication', async () => {
    const assetsDir = mkdtempSync(join(tmpdir(), 'aijolt-e2e-'));
    const prevAssets = config.story.assetsDir;
    const prevWidth = config.story.width;
    const prevHeight = config.story.height;
    const prevFps = config.story.fps;
    config.story.assetsDir = assetsDir;
    config.story.width = 90;
    config.story.height = 160;
    config.story.fps = 8;
    const db = createDb(':memory:');
    const store = new StoryStore(db);
    const episode = store.createEpisode('J\'ai raté mon bus et tout a basculé.', 120);
    const pipeline = new StoryPipeline({ store, llm: throwingLlm, gmi: throwingGmi(), dryRun: true });
    const ready = await pipeline.run(episode.id);
    expect(ready.status).toBe('REVIEW_READY');
    await expect(publishEpisode({ store, gmi: throwingGmi(), episodeId: episode.id, dryRun: true })).rejects.toThrow(/APPROVED/);
    expect(store.latestValid(episode.id, 'mp4')?.path).toBeTruthy();
    expect(store.latestValid(episode.id, 'subtitle')?.path).toBeTruthy();
    expect(store.latestValid(episode.id, 'narration')?.path).toBeTruthy();
    const reused = await pipeline.run(episode.id);
    expect(reused.status).toBe('REVIEW_READY');
    expect(() => store.approve(episode.id, store.listAssets(episode.id, 'narration')[0].id)).toThrow();
    const mp4 = store.latestValid(episode.id, 'mp4')!;
    const approved = store.approve(episode.id, mp4.id);
    expect(approved.status).toBe('APPROVED');
    const first = await publishEpisode({ store, gmi: throwingGmi(), episodeId: episode.id, dryRun: true, destinations: ['instagram', 'youtube'] });
    expect(first.find(item => item.destination === 'instagram')?.status).toBe('dry-run');
    const liveBufferCalls: object[] = [];
    const previousToken = config.buffer.token;
    const previousInstagram = config.buffer.instagram;
    const previousMediaBase = config.story.mediaPublicBaseUrl;
    config.buffer.token = 'test-token';
    config.buffer.instagram = 'instagram-channel';
    config.story.mediaPublicBaseUrl = 'https://media.example.com';
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      liveBufferCalls.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ data: { createPost: { post: { id: 'buf-1', dueAt: '2026-09-08T00:00:00Z' } } } }), { status: 200 });
    }));
    try {
      const queued = await publishEpisode({ store, gmi: throwingGmi(), episodeId: episode.id, dryRun: false, destinations: ['instagram'] });
      expect(queued[0].status).toBe('queued');
      expect(queued[0].providerId).toBe('buf-1');
      const again = await publishEpisode({ store, gmi: throwingGmi(), episodeId: episode.id, dryRun: false, destinations: ['instagram'] });
      expect(again[0].reason).toMatch(/already submitted/);
      expect(liveBufferCalls).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
      config.buffer.token = previousToken;
      config.buffer.instagram = previousInstagram;
      config.story.mediaPublicBaseUrl = previousMediaBase;
      config.story.assetsDir = prevAssets;
      config.story.width = prevWidth;
      config.story.height = prevHeight;
      config.story.fps = prevFps;
    }
  }, 120_000);
});

describe('assemblage', () => {
  it('concatène des segments, pose la narration et écrit un SRT', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aijolt-asm-'));
    const prevW = config.story.width;
    const prevH = config.story.height;
    const prevF = config.story.fps;
    config.story.width = 90;
    config.story.height = 160;
    config.story.fps = 8;
    try {
      const seg1 = join(dir, 'a.mp4');
      const seg2 = join(dir, 'b.mp4');
      const narration = join(dir, 'n.mp3');
      await makeDryRunSegment(seg1, 1, 'a');
      await makeDryRunSegment(seg2, 1, 'b');
      await makeDryRunNarration(narration, 2);
      const result = await assembleEpisode({
        segmentPaths: [seg1, seg2],
        narrationPath: narration,
        cues: proportionalCues('Bonjour le monde. Suite du récit.', 2000),
        workDir: join(dir, 'out'),
      });
      expect(result.durationMs).toBeGreaterThan(500);
      expect(result.width / result.height).toBeCloseTo(9 / 16, 1);
      expect(result.srtPath).toMatch(/\.srt$/);
    } finally {
      config.story.width = prevW;
      config.story.height = prevH;
      config.story.fps = prevF;
    }
  }, 60_000);
});
