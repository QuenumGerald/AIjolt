export function clampJobsPerCycle(value: number, max = 2): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(Math.floor(value), max));
}

export function nextRequestWaitMs(lastRequestAtMs: number | null, nowMs: number, gapMs: number): number {
  if (lastRequestAtMs == null || gapMs <= 0) return 0;
  return Math.max(0, lastRequestAtMs + gapMs - nowMs);
}

export function parseRetryAfterSeconds(header: string | null): number {
  const value = Number.parseInt(header || '', 10);
  return Number.isFinite(value) && value > 0 ? value : 60;
}
