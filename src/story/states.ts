import type { EpisodeStatus } from './types.js';

const allowed: Record<EpisodeStatus, EpisodeStatus[]> = {
  DRAFT: ['SCRIPT_READY', 'FAILED', 'CANCELLED'],
  SCRIPT_READY: ['GENERATING', 'SCRIPT_READY', 'DRAFT', 'FAILED', 'CANCELLED'],
  GENERATING: ['ASSEMBLING', 'SCRIPT_READY', 'FAILED', 'CANCELLED'],
  ASSEMBLING: ['REVIEW_READY', 'GENERATING', 'FAILED', 'CANCELLED'],
  REVIEW_READY: ['APPROVED', 'SCRIPT_READY', 'GENERATING', 'FAILED', 'CANCELLED'],
  APPROVED: ['SCRIPT_READY', 'CANCELLED'],
  FAILED: ['SCRIPT_READY', 'GENERATING', 'ASSEMBLING', 'REVIEW_READY', 'CANCELLED'],
  CANCELLED: [],
};

export function assertTransition(from: EpisodeStatus, to: EpisodeStatus): void {
  if (from === to) return;
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid episode transition: ${from} -> ${to}`);
  }
}

export function canResume(status: EpisodeStatus): boolean {
  return status !== 'CANCELLED';
}
