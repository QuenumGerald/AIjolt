import type Database from 'better-sqlite3';

export type RankedStat = { name: string; count: number };
export type JobStatistics = {
  topSkills: RankedStat[]; topCountries: RankedStat[]; topCompanies: RankedStat[];
  jobsLast24h: number; jobsLast7d: number; remoteJobs: number; topAIKeywords: RankedStat[];
  averageScore: number; mostRequestedTechnologies: RankedStat[];
};

const ranked = (database: Database.Database, field: 'country'|'company', limit: number): RankedStat[] => database.prepare(`SELECT ${field} name,count(*) count FROM jobs WHERE status='active' AND ${field} NOT IN ('','Unknown') GROUP BY ${field} ORDER BY count DESC,name LIMIT ?`).all(limit) as RankedStat[];
export function topSkills(database: Database.Database, limit = 10): RankedStat[] { return database.prepare(`SELECT value name,count(*) count FROM jobs,json_each(jobs.skills_json) WHERE status='active' GROUP BY value ORDER BY count DESC,value LIMIT ?`).all(limit) as RankedStat[]; }
export const topCountries = (database: Database.Database, limit = 10) => ranked(database, 'country', limit);
export const topCompanies = (database: Database.Database, limit = 10) => ranked(database, 'company', limit);
const count = (database: Database.Database, where: string) => (database.prepare(`SELECT count(*) count FROM jobs WHERE status='active' AND ${where}`).get() as {count:number}).count;
export function getJobStatistics(database: Database.Database): JobStatistics {
  const skills = topSkills(database);
  return {
    topSkills: skills, topCountries: topCountries(database), topCompanies: topCompanies(database),
    jobsLast24h: count(database, `first_seen_at >= datetime('now','-1 day')`),
    jobsLast7d: count(database, `first_seen_at >= datetime('now','-7 days')`),
    remoteJobs: count(database, `work_mode='remote'`),
    topAIKeywords: skills.filter(item => /LLM|RAG|NLP|AI|Vision|Robotic|MLOps/i.test(item.name)),
    averageScore: Number(((database.prepare(`SELECT coalesce(avg(score),0) average FROM jobs WHERE status='active'`).get() as {average:number}).average).toFixed(1)),
    mostRequestedTechnologies: skills,
  };
}
