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
CREATE TABLE IF NOT EXISTS content_campaigns (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL, prompt TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1, weight REAL NOT NULL DEFAULT 1, cooldown_days INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(type, name)
);
CREATE TABLE IF NOT EXISTS generated_content (
  id INTEGER PRIMARY KEY, campaign_id INTEGER NOT NULL, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
  excerpt TEXT NOT NULL, text TEXT NOT NULL, markdown TEXT NOT NULL, html TEXT NOT NULL,
  seo_title TEXT NOT NULL, seo_description TEXT NOT NULL, image TEXT,
  status TEXT NOT NULL CHECK(status IN ('draft','published','failed')), provider_id TEXT,
  published_at TEXT, created_at TEXT NOT NULL, error TEXT,
  FOREIGN KEY(campaign_id) REFERENCES content_campaigns(id)
);
CREATE INDEX IF NOT EXISTS generated_content_status ON generated_content(status, published_at DESC);
