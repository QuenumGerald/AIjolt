import type { Cue } from './types.js';

const sentenceSplit = /(?<=[.!?…])\s+/;

export function splitNarration(text: string): string[] {
  const parts = text.split(sentenceSplit).map(part => part.trim()).filter(Boolean);
  return parts.length ? parts : [text.trim()].filter(Boolean);
}

export function cuesFromTtsTimestamps(raw: unknown, fallbackText: string, durationMs: number): Cue[] | null {
  if (!raw) return null;
  const items = Array.isArray(raw) ? raw
    : Array.isArray((raw as any).words) ? (raw as any).words
      : Array.isArray((raw as any).sentences) ? (raw as any).sentences
        : null;
  if (!items?.length) return null;
  const cues: Cue[] = [];
  for (const item of items) {
    const text = String(item.text ?? item.word ?? item.content ?? '').trim();
    const startMs = Number(item.start_ms ?? item.startMs ?? (item.start != null ? item.start * (item.start < 100 ? 1000 : 1) : NaN));
    const endMs = Number(item.end_ms ?? item.endMs ?? (item.end != null ? item.end * (item.end < 100 ? 1000 : 1) : NaN));
    if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    cues.push({ startMs, endMs, text, alignment: 'tts-timestamps' });
  }
  return cues.length ? cues : null;
}

export function proportionalCues(text: string, durationMs: number): Cue[] {
  const parts = splitNarration(text);
  const totalChars = parts.reduce((sum, part) => sum + part.length, 0) || 1;
  let cursor = 0;
  return parts.map((part, index) => {
    const span = Math.round((part.length / totalChars) * durationMs);
    const startMs = cursor;
    const endMs = index === parts.length - 1 ? durationMs : Math.min(durationMs, cursor + Math.max(span, 400));
    cursor = endMs;
    return { startMs, endMs, text: part, alignment: 'duration-proportional' as const };
  });
}

export function buildCues(text: string, durationMs: number, ttsTimestamps: unknown): Cue[] {
  return cuesFromTtsTimestamps(ttsTimestamps, text, durationMs) ?? proportionalCues(text, durationMs);
}

function srtTime(ms: number): string {
  const clamped = Math.max(0, ms);
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const millis = clamped % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

export function cuesToSrt(cues: Cue[]): string {
  return cues.map((cue, index) => `${index + 1}\n${srtTime(cue.startMs)} --> ${srtTime(cue.endMs)}\n${cue.text}\n`).join('\n');
}
