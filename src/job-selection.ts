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


import type Database from 'better-sqlite3';

export type PostedJobIdentity = { company: string; title: string; url: string; text: string };

/** All-time last two posts for rotation; exactly 14 days of posts for title dedupe. */
export function postedJobHistory(db: Database.Database, network: 'x' | 'linkedin', now = Date.now()): {
  recent: PostedJobIdentity[];
  lastTwo: PostedJobIdentity[];
} {
  const select = `SELECT j.company,j.title,j.url,p.text FROM publications p JOIN jobs j ON j.id=p.job_id WHERE p.network=? AND p.status IN ('published','queued')`;
  const order = ` ORDER BY julianday(coalesce(p.due_at,p.created_at)) DESC, p.id DESC`;
  const since = new Date(now - 14 * 86400_000).toISOString();
  const recent = db.prepare(`${select} AND julianday(coalesce(p.due_at,p.created_at)) >= julianday(?)${order}`)
    .all(network, since) as PostedJobIdentity[];
  const lastTwo = db.prepare(`${select}${order} LIMIT 2`).all(network) as PostedJobIdentity[];
  return { recent, lastTwo };
}
