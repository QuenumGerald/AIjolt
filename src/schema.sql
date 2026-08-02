PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
  dedupe_key TEXT NOT NULL, title TEXT NOT NULL, company TEXT NOT NULL, location TEXT NOT NULL, country TEXT NOT NULL,
  work_mode TEXT NOT NULL, salary TEXT, description TEXT NOT NULL, posted_at TEXT, first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL, expires_at TEXT, status TEXT NOT NULL DEFAULT 'active', skills_json TEXT NOT NULL,
  ai_relevance REAL NOT NULL, visa_sponsored INTEGER NOT NULL, score REAL NOT NULL DEFAULT 0,
  UNIQUE(source, external_id)
);
CREATE INDEX IF NOT EXISTS jobs_selection ON jobs(status, score DESC);
CREATE INDEX IF NOT EXISTS jobs_dedupe ON jobs(dedupe_key);
CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL, network TEXT NOT NULL, status TEXT NOT NULL,
  text TEXT NOT NULL, provider_id TEXT, error TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES jobs(id), UNIQUE(job_id, network)
);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, details TEXT, started_at TEXT NOT NULL, finished_at TEXT);
