import { config } from '../config.js';
import type { CharacterStyle, EpisodeScript } from './types.js';
import { lockedOutfit } from './character.js';

export class ScriptValidationError extends Error {
  constructor(message: string, readonly issues: string[]) {
    super(message);
    this.name = 'ScriptValidationError';
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function findForbiddenHits(text: string, tokens: string[]): string[] {
  const hay = normalizeText(text);
  return tokens.filter(token => {
    const needle = normalizeText(token);
    return needle && hay.includes(needle);
  });
}

function narrationFromScenes(script: EpisodeScript): string {
  return script.scenes.map(scene => scene.narration.trim()).filter(Boolean).join(' ');
}

/** Force locked outfit onto every scene; strip/reject forbidden visual tokens. */
export function enforceCharacterLocks(script: EpisodeScript, character: CharacterStyle): EpisodeScript {
  const scenes = script.scenes.map(scene => {
    const outfit = lockedOutfit(character, scene.outfit);
    let visualPrompt = scene.visualPrompt;
    for (const token of character.forbiddenVisualTokens) {
      if (!token.trim()) continue;
      visualPrompt = visualPrompt.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    }
    visualPrompt = visualPrompt.replace(/\s{2,}/g, ' ').trim();
    return {
      ...scene,
      outfit,
      visualPrompt,
      continuityNotes: character.outfitLocked
        ? [scene.continuityNotes, `tenue verrouillée: ${outfit}`].filter(Boolean).join(' | ')
        : scene.continuityNotes,
    };
  });
  return { ...script, scenes };
}

export function validateEpisodeScript(
  script: EpisodeScript,
  character: CharacterStyle,
  durationSeconds: number,
): { script: EpisodeScript; warnings: string[] } {
  const issues: string[] = [];
  const warnings: string[] = [];

  if (!script.title?.trim()) issues.push('title manquant');
  if (!script.narration?.trim()) issues.push('narration manquante');
  if (!script.scenes?.length) issues.push('aucune scène');

  const expectedScenes = Math.ceil(durationSeconds / config.story.segmentMaxSeconds);
  if (script.scenes.length !== expectedScenes) {
    issues.push(`nombre de scènes ${script.scenes.length} ≠ planifié ${expectedScenes} pour ${durationSeconds}s`);
  }

  const joined = narrationFromScenes(script);
  if (joined && normalizeText(joined) !== normalizeText(script.narration)) {
    // Soft mismatch: keep as warning — LLM often paraphrases slightly; hard-fail only if empty scene narrations.
    warnings.push('narration globale ≠ concaténation des scènes (vérifier fidélité orale)');
  }
  for (const scene of script.scenes) {
    if (!scene.narration.trim()) issues.push(`scène ${scene.index}: narration vide`);
    if (!scene.visualPrompt.trim()) issues.push(`scène ${scene.index}: visualPrompt vide`);
    if (!scene.location.trim()) warnings.push(`scène ${scene.index}: location vide`);
  }

  // Reject hallucinations before rewrite so Seedance never sees them.
  for (const scene of script.scenes) {
    const hits = findForbiddenHits(`${scene.outfit} ${scene.visualPrompt}`, character.forbiddenVisualTokens);
    if (hits.length) {
      issues.push(`scène ${scene.index}: tokens interdits (${hits.join(', ')})`);
    }
  }

  if (issues.length) {
    throw new ScriptValidationError(`Script invalide: ${issues.join('; ')}`, issues);
  }

  const locked = enforceCharacterLocks(script, character);

  if (character.outfitLocked && character.outfit) {
    for (const scene of locked.scenes) {
      if (normalizeText(scene.outfit) !== normalizeText(character.outfit)) {
        issues.push(`scène ${scene.index}: outfit non verrouillé sur la bible`);
      }
    }
  }

  const styleLower = normalizeText(character.style);
  if (styleLower.includes('2d') && !styleLower.includes('3d')) {
    for (const scene of locked.scenes) {
      if (/\b3d\b/i.test(scene.visualPrompt) && !/anime|2d/i.test(scene.visualPrompt)) {
        warnings.push(`scène ${scene.index}: visualPrompt mentionne 3D alors que la bible est 2D`);
      }
    }
  }

  if (character.name) {
    const identityHint = character.name.split(/\s+/)[0];
    const anyMention = locked.scenes.some(scene => normalizeText(scene.visualPrompt).includes(normalizeText(identityHint)));
    if (!anyMention) {
      warnings.push(`aucune scène ne mentionne le nom « ${identityHint} » dans visualPrompt`);
    }
  }

  if (issues.length) {
    throw new ScriptValidationError(`Script invalide: ${issues.join('; ')}`, issues);
  }

  return { script: locked, warnings };
}
