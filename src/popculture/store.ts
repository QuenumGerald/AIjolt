import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { popConfig } from './config.js';
import { titlesMatch } from './relevance.js';
import type { DraftItem, ItemStatus } from './types.js';

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS pop_items (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  dedupe_key TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  publisher TEXT NOT NULL,
  category TEXT NOT NULL,
  published_at TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  score REAL NOT NULL,
  status TEXT NOT NULL,
  rejection TEXT,
  post_text TEXT,
  video_kind TEXT,
  video_url TEXT,
  video_mime TEXT,
  video_bytes INTEGER,
  video_duration REAL,
  video_rights TEXT,
  video_attach INTEGER NOT NULL DEFAULT 0,
  video_rejection TEXT,
  UNIQUE(source, external_id)
);
CREATE INDEX IF NOT EXISTS pop_ready ON pop_items(status, score DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS pop_dedupe ON pop_items(dedupe_key);
CREATE TABLE IF NOT EXISTS pop_publications (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  text TEXT NOT NULL,
  video_url TEXT,
  provider_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(item_id),
  FOREIGN KEY(item_id) REFERENCES pop_items(id)
);
CREATE TABLE IF NOT EXISTS pop_video_attempts (
  url TEXT PRIMARY KEY,
  attempted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pop_runs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
`;

export function popDedupeKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function openPopDb(path = popConfig().databasePath): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('busy_timeout = 5000');
  db.exec(schema);
  return db;
}

export function upsertItem(db: Database.Database, item: DraftItem): void {
  const now = new Date().toISOString();
  const key = popDedupeKey(item.title);
  const duplicate = db.prepare(`SELECT id, rejection FROM pop_items WHERE (url=? OR (source=? AND external_id=?))`).get(item.url, item.source, item.externalId) as { id: number; rejection: string | null } | undefined;
  if (duplicate) {
    const status = duplicate.rejection === 'same event already stored' ? 'rejected' : item.status;
    const rejection = duplicate.rejection === 'same event already stored' ? duplicate.rejection : item.rejection;
    db.prepare(`UPDATE pop_items SET last_seen_at=?, score=?, title=?, post_text=?, status=?, rejection=?, video_url=?, video_kind=?, video_mime=?, video_bytes=?, video_duration=?, video_attach=?, video_rejection=? WHERE id=? AND status IN ('ready','rejected')`)
      .run(now, item.score, item.title, item.postText, status, rejection, item.video.url, item.video.kind, item.video.mime, item.video.bytes, item.video.durationSeconds, Number(item.video.attach), item.video.rejection, duplicate.id);
    return;
  }
  const event = db.prepare(`SELECT id, title, status FROM pop_items WHERE status IN ('ready','attempted','queued','published') ORDER BY published_at DESC LIMIT 200`).all() as Array<{ id: number; title: string; status: string }>;
  if (event.some(row => titlesMatch(row.title, item.title))) {
    item = { ...item, status: 'rejected', rejection: item.rejection ?? 'same event already stored' };
  }
  db.prepare(`INSERT INTO pop_items(source,external_id,url,dedupe_key,title,summary,publisher,category,published_at,first_seen_at,last_seen_at,score,status,rejection,post_text,video_kind,video_url,video_mime,video_bytes,video_duration,video_rights,video_attach,video_rejection)
    VALUES(@source,@externalId,@url,@key,@title,@summary,@publisher,@category,@publishedAt,@now,@now,@score,@status,@rejection,@postText,@videoKind,@videoUrl,@videoMime,@videoBytes,@videoDuration,@videoRights,@videoAttach,@videoRejection)`).run({
    ...item,
    key,
    now,
    postText: item.postText,
    rejection: item.rejection,
    videoKind: item.video.kind,
    videoUrl: item.video.url,
    videoMime: item.video.mime,
    videoBytes: item.video.bytes,
    videoDuration: item.video.durationSeconds,
    videoRights: item.video.rights,
    videoAttach: Number(item.video.attach),
    videoRejection: item.video.rejection,
  });
}

export type StoredItem = DraftItem & { id: number };

export function rowToItem(row: Record<string, unknown>): StoredItem {
  return {
    id: Number(row.id),
    source: String(row.source),
    externalId: String(row.external_id),
    url: String(row.url),
    title: String(row.title),
    summary: String(row.summary),
    publisher: String(row.publisher),
    category: row.category as StoredItem['category'],
    publishedAt: String(row.published_at),
    score: Number(row.score),
    status: row.status as StoredItem['status'],
    rejection: row.rejection == null ? null : String(row.rejection),
    postText: row.post_text == null ? null : String(row.post_text),
    video: {
      kind: (row.video_kind as StoredItem['video']['kind']) ?? 'none',
      url: row.video_url == null ? null : String(row.video_url),
      mime: row.video_mime == null ? null : String(row.video_mime),
      bytes: row.video_bytes == null ? null : Number(row.video_bytes),
      durationSeconds: row.video_duration == null ? null : Number(row.video_duration),
      rights: (row.video_rights as StoredItem['video']['rights']) ?? 'unconfirmed',
      stable: String(row.video_kind) === 'direct-file',
      attach: Boolean(row.video_attach),
      rejection: String(row.video_rejection ?? ''),
    },
  };
}

export function listQueue(db: Database.Database, status: ItemStatus | 'all' = 'ready', limit = 20): StoredItem[] {
  const rows = status === 'all'
    ? db.prepare(`SELECT * FROM pop_items ORDER BY score DESC, published_at DESC LIMIT ?`).all(limit)
    : db.prepare(`SELECT * FROM pop_items WHERE status=? ORDER BY score DESC, published_at DESC LIMIT ?`).all(status, limit);
  return rows.map(row => rowToItem(row as Record<string, unknown>));
}

export function markAttempt(db: Database.Database, id: number, text: string, videoUrl: string | null): void {
  const now = new Date().toISOString();
  db.prepare(`UPDATE pop_items SET status='attempted' WHERE id=? AND status='ready'`).run(id);
  db.prepare(`INSERT INTO pop_publications(item_id,status,text,video_url,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(item_id) DO UPDATE SET status='attempted', text=excluded.text, video_url=excluded.video_url, error=NULL`).run(id, 'attempted', text, videoUrl, now);
}

export function markQueued(db: Database.Database, id: number, providerId: string): void {
  db.prepare(`UPDATE pop_items SET status='queued' WHERE id=?`).run(id);
  db.prepare(`UPDATE pop_publications SET status='queued', provider_id=? WHERE item_id=?`).run(providerId, id);
}

export function markFailed(db: Database.Database, id: number, error: string, restore = false): void {
  db.prepare(`UPDATE pop_items SET status=? WHERE id=?`).run(restore ? 'ready' : 'attempted', id);
  db.prepare(`UPDATE pop_publications SET status=?, error=? WHERE item_id=?`).run(restore ? 'failed' : 'attempted', error, id);
}

export function recentPublishCount(db: Database.Database, hours = 24): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM pop_publications WHERE julianday(created_at) >= julianday('now', ?) AND status IN ('attempted','queued','published')`).get(`-${hours} hours`) as { n: number }).n;
}

export function lastPublishAt(db: Database.Database): string | null {
  const row = db.prepare(`SELECT created_at FROM pop_publications WHERE status IN ('attempted','queued','published') ORDER BY created_at DESC LIMIT 1`).get() as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

export function logRun(db: Database.Database, kind: string, status: string, details: string): void {
  db.prepare(`INSERT INTO pop_runs(kind,status,details,started_at,finished_at) VALUES(?,?,?,datetime('now'),datetime('now'))`).run(kind, status, details);
}
