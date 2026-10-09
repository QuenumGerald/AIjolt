import { existsSync, readFileSync } from 'node:fs';
import { config } from '../config.js';
import type { CharacterCompanion, CharacterStyle } from './types.js';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim()).filter(Boolean);
}

function asCompanions(value: unknown): CharacterCompanion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const row = item as { id?: unknown; description?: unknown };
      const id = String(row.id ?? '').trim();
      const description = String(row.description ?? '').trim();
      if (!id || !description) return null;
      return { id, description };
    })
    .filter((row): row is CharacterCompanion => Boolean(row));
}

export function loadCharacterStyle(): CharacterStyle {
  let file: Partial<CharacterStyle> & { outfitLocked?: boolean } = {};
  if (existsSync(config.story.characterConfigPath)) {
    file = JSON.parse(readFileSync(config.story.characterConfigPath, 'utf8')) as Partial<CharacterStyle>;
  }
  // Env style only wins when explicitly set; otherwise the bible JSON is source of truth.
  const styleFromEnv = config.story.styleDescription.trim();
  const style: CharacterStyle = {
    name: config.story.characterName || file.name || '',
    description: config.story.characterDescription || file.description || '',
    outfit: config.story.characterOutfit || file.outfit || '',
    outfitLocked: file.outfitLocked !== false,
    style: styleFromEnv || file.style || 'animation 3D stylisée, rendu cinématique propre, éclairage doux',
    continuityDetails: config.story.continuityDetails || file.continuityDetails || '',
    companions: asCompanions(file.companions),
    props: asStringArray(file.props),
    forbiddenVisualTokens: asStringArray(file.forbiddenVisualTokens),
    referenceImageUrls: config.story.referenceImageUrls.length ? config.story.referenceImageUrls : (file.referenceImageUrls ?? []),
    referenceImagePaths: config.story.referenceImagePaths.length ? config.story.referenceImagePaths : (file.referenceImagePaths ?? []),
    referenceVideoUrls: config.story.referenceVideoUrls.length ? config.story.referenceVideoUrls : (file.referenceVideoUrls ?? []),
    avatarAssetIds: config.story.avatarAssetIds.length ? config.story.avatarAssetIds : (file.avatarAssetIds ?? []),
    missing: [],
  };
  if (!style.name) style.missing.push('nom du personnage');
  if (!style.description) style.missing.push('description du personnage');
  if (!style.referenceImageUrls.length && !style.referenceImagePaths.length && !style.avatarAssetIds.length) {
    style.missing.push('référence visuelle (STORY_CHARACTER_REFERENCE_URLS, STORY_AVATAR_ASSET_IDS ou config/character.json)');
  }
  for (const path of style.referenceImagePaths) {
    if (!existsSync(path)) style.missing.push(`fichier référence manquant: ${path}`);
  }
  return style;
}

export function assertCharacterReady(style: CharacterStyle, dryRun: boolean): void {
  if (dryRun) return;
  if (style.missing.length) {
    throw new Error(`Références de personnage manquantes: ${style.missing.join('; ')}. Aucune création automatique de personnage n'est lancée.`);
  }
}

export function characterPromptBlock(style: CharacterStyle): string {
  const companions = style.companions.length
    ? `COMPAGNONS AUTORISÉS UNIQUEMENT: ${style.companions.map(c => `${c.id} (${c.description})`).join(' ; ')}`
    : '';
  const props = style.props.length ? `PROPS AUTORISÉS: ${style.props.join(', ')}` : '';
  const forbidden = style.forbiddenVisualTokens.length
    ? `INTERDIT dans les prompts visuels / tenues: ${style.forbiddenVisualTokens.join(', ')}`
    : '';
  return [
    `Personnage récurrent: ${style.name || '(non nommé)'}`,
    `Identité (ne pas altérer le visage, la silhouette, la coupe): ${style.description}`,
    style.outfit
      ? (style.outfitLocked
        ? `TENUE VERROUILLÉE (ne pas modifier, ne pas ajouter d'accessoires): ${style.outfit}`
        : `Vêtements/accessoires: ${style.outfit}`)
      : '',
    `Style visuel (source de vérité): ${style.style}`,
    style.continuityDetails ? `Continuité obligatoire: ${style.continuityDetails}` : '',
    companions,
    props,
    forbidden,
    'Conserver strictement la même identité, la même tenue signature, le même style visuel, et la cohérence des lieux.',
    'N\'invente aucun personnage, accessoire, tatouage, chapeau ou recoloration hors bible.',
  ].filter(Boolean).join('\n');
}

export function lockedOutfit(style: CharacterStyle, sceneOutfit?: string): string {
  if (style.outfitLocked && style.outfit) return style.outfit;
  return (sceneOutfit || style.outfit || '').trim();
}
