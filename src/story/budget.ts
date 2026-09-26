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
  if (dryRun) return;
  const missing: string[] = [];
  if (config.gmi.usdPerSecond720p == null) missing.push('GMI_VIDEO_USD_PER_SECOND_720P');
  if (config.deepseek.usdPer1kInputTokens == null || config.deepseek.usdPer1kOutputTokens == null) {
    missing.push('DEEPSEEK_USD_PER_1K_INPUT_TOKENS et DEEPSEEK_USD_PER_1K_OUTPUT_TOKENS');
  }
  if (missing.length && !config.story.budgetAllowUnknown) {
    throw new BudgetError(`Tarifs manquants pour respecter le budget: ${missing.join(', ')}. Renseignez-les ou passez STORY_BUDGET_ALLOW_UNKNOWN=true (les coûts resteront unknown).`);
  }
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
  if ((snap.episodeUnknown > 0 || snap.globalUnknown > 0) && !config.story.budgetAllowUnknown && !config.dryRun) {
    throw new BudgetError('Des coûts unknown existent déjà. Configurez les tarifs avant de continuer.');
  }
  const episodeTotal = knownSpend(snap.episodeEstimated, snap.episodeConfirmed) + additionalEstimated;
  const globalTotal = knownSpend(snap.globalEstimated, snap.globalConfirmed) + additionalEstimated;
  if (config.story.budgetEpisodeUsd != null && episodeTotal > config.story.budgetEpisodeUsd) {
    throw new BudgetError(`Plafond épisode dépassé: ${episodeTotal.toFixed(4)} USD > ${config.story.budgetEpisodeUsd} USD`);
  }
  if (config.story.budgetGlobalUsd != null && globalTotal > config.story.budgetGlobalUsd) {
    throw new BudgetError(`Plafond global (${config.story.budgetPeriodDays} j) dépassé: ${globalTotal.toFixed(4)} USD > ${config.story.budgetGlobalUsd} USD`);
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
