/** Rank relevant job offers while giving lesser-shown companies a fair turn. */
export function diversifyJobCandidates<T extends { company: string; score: number }>(
  rows: readonly T[], recent: readonly { company: string }[],
): T[] {
  const companyKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');
  const counts = new Map<string, number>();
  for (const item of recent) {
    const key = companyKey(item.company);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // A few points of ranking penalty per recently shown job preserve AI
  // relevance while preventing a single large hiring board monopolizing X.
  const effective = (row: T) => row.score - 2.5 * (counts.get(companyKey(row.company)) ?? 0);
  return [...rows].sort((a, b) => effective(b) - effective(a) || b.score - a.score);
}
