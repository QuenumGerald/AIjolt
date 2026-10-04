export function nextCustomDueAt(nowMs: number, lastDueMs: number | null, intervalMinutes: number, minLeadMinutes = 5): string {
  const minStart = nowMs + minLeadMinutes * 60_000;
  const afterLast = lastDueMs != null ? lastDueMs + intervalMinutes * 60_000 : minStart;
  return new Date(Math.max(minStart, afterLast)).toISOString();
}
