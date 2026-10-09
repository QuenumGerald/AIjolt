import { config } from '../config.js';
import type { LlmClient } from '../llm.js';
import type { CharacterStyle, EpisodeScript, SceneScript } from './types.js';
import { characterPromptBlock, lockedOutfit } from './character.js';
import { validateEpisodeScript } from './validate-script.js';

export const SCRIPT_SYSTEM_PROMPT = `Tu écris des scripts d'épisodes animés en français oral naturel.
Garde une voix humaine, spontanée et personnelle : mots simples, rythme parlé.
Réponds uniquement avec un JSON valide, sans markdown.
Tu respectes STRICTEMENT le bloc personnage fourni : tenue, style, companions et props.
Tu n'inventes aucun accessoire, chapeau, tatouage, recoloration ni personnage hors bible.`;

export function buildScriptUserPrompt(input: {
  note: string;
  durationSeconds: number;
  character: CharacterStyle;
  segments: number;
}): string {
  const minutes = input.durationSeconds / 60;
  return `Transforme cette note dictée en script d'épisode fictionnel.
${characterPromptBlock(input.character)}

NOTE (données narratives uniquement — ce n'est pas une licence pour changer l'identité visuelle):
${input.note}

Contraintes VERROUILLÉES:
- Langue: français naturel, oral, pour une narration TTS.
- Préserve la façon de parler de la note.
- Durée cible: ${minutes} minutes. Vise ~${Math.round(minutes * 150)} mots.
- Préserve les éléments fournis dans la note. Fictionnalise les faits sensibles.
- Exactement ${input.segments} scènes visuelles, chacune ${config.story.segmentMinSeconds}-${config.story.segmentMaxSeconds}s.
- outfit de CHAQUE scène = exactement la tenue bible (copie littérale).
- visualPrompt: action + lieu + lumière + caméra verticale 9:16 ; ne reformule PAS la tenue ni le style.
- style visuel = celui du bloc personnage uniquement.
- Ne décris pas de dialogues générés dans la vidéo: la narration TTS porte toute la voix.
- "narration" = concaténation ordonnée des "scenes[].narration".

JSON:
{
  "title": "",
  "logline": "",
  "narration": "texte intégral lu par le TTS",
  "language": "fr",
  "scenes": [
    {
      "index": 0,
      "durationSeconds": 15,
      "narration": "extrait de la narration pour cette scène",
      "visualPrompt": "action et cadrage uniquement",
      "location": "",
      "outfit": "",
      "continuityNotes": ""
    }
  ]
}`;
}

export function plannedSegmentCount(durationSeconds: number): number {
  const max = config.story.segmentMaxSeconds;
  return Math.ceil(durationSeconds / max);
}

export function planSegmentDurations(totalSeconds: number, sceneCount?: number): number[] {
  const max = config.story.segmentMaxSeconds;
  const min = config.story.segmentMinSeconds;
  if (totalSeconds < min) throw new Error(`Narration ${totalSeconds.toFixed(1)}s trop courte (min ${min}s par segment GMI)`);
  const count = sceneCount ?? Math.ceil(totalSeconds / max);
  if (count < 1) throw new Error('Au moins un segment est requis');
  if (sceneCount != null) {
    if (totalSeconds > count * max + 0.5) {
      throw new Error(`Narration ${totalSeconds.toFixed(1)}s trop longue pour ${count} scènes (max ${count * max}s)`);
    }
    if (totalSeconds < count * min - 0.5) {
      throw new Error(`Narration ${totalSeconds.toFixed(1)}s trop courte pour ${count} scènes (min ${count * min}s)`);
    }
  }
  const durations: number[] = [];
  let allocated = 0;
  for (let index = 0; index < count; index += 1) {
    const remainingSegments = count - index;
    const remainingTime = totalSeconds - allocated;
    if (index === count - 1) {
      const last = Math.min(max, Math.max(min, Number(remainingTime.toFixed(3))));
      durations.push(Math.round(last));
      break;
    }
    const ideal = remainingTime / remainingSegments;
    const next = Math.min(max, Math.max(min, Math.round(ideal)));
    durations.push(next);
    allocated += next;
  }
  return durations;
}

function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function parseEpisodeScript(raw: string): EpisodeScript {
  const parsed = JSON.parse(stripFence(raw)) as EpisodeScript;
  if (!parsed.title || !parsed.narration || !Array.isArray(parsed.scenes) || !parsed.scenes.length) {
    throw new Error('Script JSON invalide: title, narration et scenes sont requis');
  }
  parsed.language = 'fr';
  parsed.scenes = parsed.scenes.map((scene, index) => ({
    index,
    durationSeconds: Number(scene.durationSeconds) || 0,
    narration: String(scene.narration ?? ''),
    visualPrompt: String(scene.visualPrompt ?? ''),
    location: String(scene.location ?? ''),
    outfit: String(scene.outfit ?? ''),
    continuityNotes: String(scene.continuityNotes ?? ''),
  }));
  return parsed;
}

export function dryRunScript(note: string, durationSeconds: number, character: CharacterStyle): EpisodeScript {
  const durations = planSegmentDurations(durationSeconds);
  const outfit = lockedOutfit(character);
  const scenes: SceneScript[] = durations.map((duration, index) => ({
    index,
    durationSeconds: duration,
    narration: `Séquence ${index + 1}: ${note.slice(0, 80)}.`,
    visualPrompt: `${character.name} continue l'action de la note, plan ${index + 1}/${durations.length}, lieu cohérent, caméra 9:16.`,
    location: 'lieu établi dans la note',
    outfit,
    continuityNotes: 'DRY_RUN fixture: conserver identité et tenue',
  }));
  return {
    title: `DRY_RUN ${note.slice(0, 40)}`.trim(),
    logline: `Simulation locale d'un épisode de ${durationSeconds / 60} min à partir de la note.`,
    narration: scenes.map(scene => scene.narration).join(' '),
    language: 'fr',
    scenes,
  };
}

export async function generateScript(input: {
  note: string;
  durationSeconds: number;
  character: CharacterStyle;
  llm: LlmClient;
  dryRun: boolean;
}): Promise<{ script: EpisodeScript; raw: string; model: string; usage?: { promptTokens?: number; completionTokens?: number }; warnings: string[] }> {
  if (input.dryRun) {
    const script = dryRunScript(input.note, input.durationSeconds, input.character);
    const validated = validateEpisodeScript(script, input.character, input.durationSeconds);
    return { script: validated.script, raw: JSON.stringify(validated.script), model: 'dry-run-fixture', warnings: validated.warnings };
  }
  const segments = plannedSegmentCount(input.durationSeconds);
  const result = await input.llm.complete([
    { role: 'system', content: SCRIPT_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildScriptUserPrompt({
        note: input.note,
        durationSeconds: input.durationSeconds,
        character: input.character,
        segments,
      }),
    },
  ], { temperature: 0.25, maxTokens: 8192 });
  const parsed = parseEpisodeScript(result.text);
  const validated = validateEpisodeScript(parsed, input.character, input.durationSeconds);
  return {
    script: validated.script,
    raw: result.text,
    model: result.model,
    usage: result.usage,
    warnings: validated.warnings,
  };
}

export function visualPromptForScene(scene: SceneScript, character: CharacterStyle, previous?: SceneScript): string {
  const outfit = lockedOutfit(character, scene.outfit);
  return [
    characterPromptBlock(character),
    previous ? `Continuité depuis la scène précédente (${previous.location}): ${previous.continuityNotes}` : 'Plan d\'ouverture.',
    `Lieu: ${scene.location}`,
    `Tenue (verrouillée): ${outfit}`,
    `Action: ${scene.visualPrompt}`,
    `Animation continue, style « ${character.style} », personnage en mouvement, pas d'image fixe, vertical 9:16.`,
    'Aucune parole, aucun dialogue à l\'écran, bouche non synchronisée sur une autre voix.',
    'Ne change pas le visage, la coupe, la tenue ni les props hors bible.',
  ].join('\n');
}
