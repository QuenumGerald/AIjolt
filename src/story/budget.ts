import { config } from '../config.js';
import type { StoryStore } from './store.js';

export class BudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BudgetError';
  }
}

export type SpendSnapshot = {
  episodeEstimated: number;
  episodeConfirmed: number;
  episodeUnknown: number;
  globalEstimated: number;
  globalConfirmed: number;
  globalUnknown: number;
};

export function knownSpend(estimated: number, confirmed: number): number {
  return Math.max(estimated, confirmed);
}

export function requireRatesForLiveRun(dryRun: boolean): void {
  void dryRun;
}

export function snapshotSpend(store: StoryStore, episodeId: number): SpendSnapshot {
  const episode = store.episodeSpend(episodeId);
  const global = store.globalSpend(config.story.budgetPeriodDays);
  return {
    episodeEstimated: episode.estimated,
    episodeConfirmed: episode.confirmed,
    episodeUnknown: episode.unknown,
    globalEstimated: global.estimated,
    globalConfirmed: global.confirmed,
    globalUnknown: global.unknown,
  };
}

export function assertWithinBudget(store: StoryStore, episodeId: number, additionalEstimated = 0): SpendSnapshot {
  const snap = snapshotSpend(store, episodeId);
  const episodeTotal = knownSpend(snap.episodeEstimated, snap.episodeConfirmed) + additionalEstimated;
  const globalTotal = knownSpend(snap.globalEstimated, snap.globalConfirmed) + additionalEstimated;
  if (config.story.budgetEpisodeUsd != null && episodeTotal > config.story.budgetEpisodeUsd) {
    throw new BudgetError(`Plafond épisode dépassé: ${episodeTotal.toFixed(4)} USD > ${config.story.budgetEpisodeUsd} USD`);
  }
  if (config.story.budgetGlobalUsd != null && globalTotal > config.story.budgetGlobalUsd) {
    throw new BudgetError(`Plafond global (${config.story.budgetPeriodDays} j) dépassé: ${globalTotal.toFixed(4)} USD`);
  }
  return snap;
}

export function ttsCostUsd(characters: number): { costKind: 'estimated'; usd: number } {
  const rate = config.gmi.ttsUsdPer1kChars ?? 0.10;
  return { costKind: 'estimated', usd: (characters / 1000) * rate };
}

export function videoCostUsd(durationSeconds: number): { costKind: 'estimated' | 'unknown'; usd: number | null } {
  if (config.gmi.usdPerSecond720p == null) return { costKind: 'unknown', usd: null };
  return { costKind: 'estimated', usd: durationSeconds * config.gmi.usdPerSecond720p };
}
