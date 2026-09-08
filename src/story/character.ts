import { existsSync, readFileSync } from 'node:fs';
import { config } from '../config.js';
import type { CharacterStyle } from './types.js';

export function loadCharacterStyle(): CharacterStyle {
  let file: Partial<CharacterStyle> = {};
  if (existsSync(config.story.characterConfigPath)) {
    file = JSON.parse(readFileSync(config.story.characterConfigPath, 'utf8')) as Partial<CharacterStyle>;
  }
  const style: CharacterStyle = {
    name: config.story.characterName || file.name || '',
    description: config.story.characterDescription || file.description || '',
    outfit: config.story.characterOutfit || file.outfit || '',
    style: config.story.styleDescription || file.style || 'animation 3D stylisée',
    continuityDetails: config.story.continuityDetails || file.continuityDetails || '',
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
  return style;
}

export function assertCharacterReady(style: CharacterStyle, dryRun: boolean): void {
  if (dryRun) return;
  if (style.missing.length) {
    throw new Error(`Références de personnage manquantes: ${style.missing.join('; ')}. Aucune création automatique de personnage n'est lancée.`);
  }
}

export function characterPromptBlock(style: CharacterStyle): string {
  return [
    `Personnage récurrent: ${style.name || '(non nommé)'}`,
    `Identité: ${style.description}`,
    style.outfit ? `Vêtements/accessoires: ${style.outfit}` : '',
    `Style visuel: ${style.style}`,
    style.continuityDetails ? `Continuité obligatoire: ${style.continuityDetails}` : '',
    'Conserver la même identité, les mêmes vêtements lorsque la continuité l\'exige, le même style 3D, et la cohérence des lieux.',
  ].filter(Boolean).join('\n');
}
