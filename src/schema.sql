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
CREATE TABLE IF NOT EXISTS news_items (
  id INTEGER PRIMARY KEY, source TEXT NOT NULL, external_id TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
  dedupe_key TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, publisher TEXT NOT NULL,
  published_at TEXT NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  buzz_score REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active',
  UNIQUE(source, external_id)
);
CREATE INDEX IF NOT EXISTS news_selection ON news_items(status, buzz_score DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS news_dedupe ON news_items(dedupe_key);
CREATE TABLE IF NOT EXISTS news_publications (
  id INTEGER PRIMARY KEY, news_id INTEGER NOT NULL, network TEXT NOT NULL DEFAULT 'x', status TEXT NOT NULL,
  text TEXT NOT NULL, provider_id TEXT, error TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY(news_id) REFERENCES news_items(id), UNIQUE(news_id, network)
);
CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, kind TEXT NOT NULL, status TEXT NOT NULL, details TEXT, started_at TEXT NOT NULL, finished_at TEXT);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY,
  title TEXT,
  note TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  status TEXT NOT NULL,
  script_json TEXT,
  script_hash TEXT,
  error TEXT,
  approved_asset_id INTEGER,
  output_mp4_asset_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS episodes_status ON episodes(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS episode_assets (
  id INTEGER PRIMARY KEY,
  episode_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  path TEXT,
  public_url TEXT,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  mime TEXT,
  metadata_json TEXT,
  checksum TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(episode_id) REFERENCES episodes(id)
);
CREATE INDEX IF NOT EXISTS episode_assets_lookup ON episode_assets(episode_id, kind, status);

CREATE TABLE IF NOT EXISTS episode_tasks (
  id INTEGER PRIMARY KEY,
  episode_id INTEGER NOT NULL,
  step TEXT NOT NULL,
  segment_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_request_id TEXT,
  error TEXT,
  input_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(episode_id, step, segment_index),
  FOREIGN KEY(episode_id) REFERENCES episodes(id)
);
CREATE INDEX IF NOT EXISTS episode_tasks_lookup ON episode_tasks(episode_id, step, status);

CREATE TABLE IF NOT EXISTS episode_publications (
  id INTEGER PRIMARY KEY,
  episode_id INTEGER NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_id TEXT,
  scheduled_at TEXT,
  error TEXT,
  caption TEXT,
  media_url TEXT,
  asset_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(episode_id, destination),
  FOREIGN KEY(episode_id) REFERENCES episodes(id)
);

CREATE TABLE IF NOT EXISTS episode_usage (
  id INTEGER PRIMARY KEY,
  episode_id INTEGER NOT NULL,
  task_id INTEGER,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  cost_kind TEXT NOT NULL,
  estimated_usd REAL,
  confirmed_usd REAL,
  units REAL,
  unit_kind TEXT,
  in_flight INTEGER NOT NULL DEFAULT 0,
  provider_request_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(episode_id) REFERENCES episodes(id)
);
CREATE INDEX IF NOT EXISTS episode_usage_lookup ON episode_usage(episode_id, created_at);
