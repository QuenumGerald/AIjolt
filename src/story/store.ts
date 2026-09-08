import { createHash } from 'node:crypto';
import { ALLOWED_EPISODE_DURATIONS } from '../config.js';
import type { EpisodeDurationSeconds } from '../config.js';
import type {
  AssetKind,
  CostKind,
  Episode,
  EpisodeAsset,
  EpisodePublication,
  EpisodeScript,
  EpisodeStatus,
  EpisodeTask,
  PublicationStatus,
  StoryDestination,
  TaskStatus,
  TaskStep,
} from './types.js';
import { assertTransition } from './states.js';
import type Database from 'better-sqlite3';

export function assertAllowedDuration(seconds: number): asserts seconds is EpisodeDurationSeconds {
  if (!ALLOWED_EPISODE_DURATIONS.includes(seconds as EpisodeDurationSeconds)) {
    throw new Error(`Duration must be 0.5, 2, 3 or 5 minutes (got ${seconds}s)`);
  }
}

export function minutesToSeconds(minutes: number): EpisodeDurationSeconds {
  const seconds = minutes * 60;
  assertAllowedDuration(seconds);
  return seconds;
}

export function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function parseScript(raw: string | null): EpisodeScript | null {
  if (!raw) return null;
  return JSON.parse(raw) as EpisodeScript;
}

function rowToEpisode(row: any): Episode {
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    durationSeconds: row.duration_seconds,
    status: row.status,
    script: parseScript(row.script_json),
    scriptHash: row.script_hash,
    error: row.error,
    approvedAssetId: row.approved_asset_id,
    outputMp4AssetId: row.output_mp4_asset_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class StoryStore {
  constructor(private readonly db: Database.Database) {}

  createEpisode(note: string, durationSeconds: number): Episode {
    assertAllowedDuration(durationSeconds);
    const now = new Date().toISOString();
    const info = this.db.prepare(`INSERT INTO episodes(note,duration_seconds,status,created_at,updated_at) VALUES(?,?, 'DRAFT', ?, ?)`)
      .run(note.trim(), durationSeconds, now, now);
    return this.getEpisode(Number(info.lastInsertRowid));
  }

  getEpisode(id: number): Episode {
    const row = this.db.prepare(`SELECT * FROM episodes WHERE id=?`).get(id);
    if (!row) throw new Error(`Episode ${id} not found`);
    return rowToEpisode(row);
  }

  listEpisodes(): Episode[] {
    return (this.db.prepare(`SELECT * FROM episodes ORDER BY id DESC`).all() as any[]).map(rowToEpisode);
  }

  setStatus(id: number, status: EpisodeStatus, error: string | null = null): Episode {
    const current = this.getEpisode(id);
    assertTransition(current.status, status);
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE episodes SET status=?, error=?, updated_at=? WHERE id=?`).run(status, error, now, id);
    return this.getEpisode(id);
  }

  saveScript(id: number, script: EpisodeScript): Episode {
    const current = this.getEpisode(id);
    const json = JSON.stringify(script);
    const hash = hashText(json);
    const scriptChanged = current.scriptHash !== hash;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      if (scriptChanged) this.invalidateDependentAssets(id);
      this.db.prepare(`UPDATE episodes SET title=?, script_json=?, script_hash=?, approved_asset_id=NULL, updated_at=? WHERE id=?`)
        .run(script.title, json, hash, now, id);
      if (current.status !== 'SCRIPT_READY') {
        assertTransition(current.status, 'SCRIPT_READY');
        this.db.prepare(`UPDATE episodes SET status='SCRIPT_READY', error=NULL, updated_at=? WHERE id=?`).run(now, id);
      } else {
        this.db.prepare(`UPDATE episodes SET error=NULL, updated_at=? WHERE id=?`).run(now, id);
      }
    })();
    return this.getEpisode(id);
  }

  invalidateDependentAssets(episodeId: number): void {
    this.db.prepare(`UPDATE episode_assets SET status='invalid' WHERE episode_id=? AND kind IN ('narration','video_segment','subtitle','mp4','thumbnail')`).run(episodeId);
    this.db.prepare(`UPDATE episodes SET approved_asset_id=NULL, output_mp4_asset_id=NULL, updated_at=? WHERE id=?`).run(new Date().toISOString(), episodeId);
  }

  addAsset(input: {
    episodeId: number;
    kind: AssetKind;
    path?: string | null;
    publicUrl?: string | null;
    durationMs?: number | null;
    width?: number | null;
    height?: number | null;
    mime?: string | null;
    metadata?: Record<string, unknown>;
    checksum?: string | null;
  }): EpisodeAsset {
    const now = new Date().toISOString();
    const info = this.db.prepare(`INSERT INTO episode_assets(episode_id,kind,status,path,public_url,duration_ms,width,height,mime,metadata_json,checksum,created_at)
      VALUES(?,?,'valid',?,?,?,?,?,?,?,?,?)`)
      .run(input.episodeId, input.kind, input.path ?? null, input.publicUrl ?? null, input.durationMs ?? null, input.width ?? null, input.height ?? null, input.mime ?? null, JSON.stringify(input.metadata ?? {}), input.checksum ?? null, now);
    return this.getAsset(Number(info.lastInsertRowid));
  }

  getAsset(id: number): EpisodeAsset {
    const row = this.db.prepare(`SELECT * FROM episode_assets WHERE id=?`).get(id) as any;
    if (!row) throw new Error(`Asset ${id} not found`);
    return this.rowToAsset(row);
  }

  listAssets(episodeId: number, kind?: AssetKind, status: 'valid' | 'invalid' | 'all' = 'valid'): EpisodeAsset[] {
    const rows = kind
      ? this.db.prepare(`SELECT * FROM episode_assets WHERE episode_id=? AND kind=? AND (?='all' OR status=?) ORDER BY id`).all(episodeId, kind, status, status)
      : this.db.prepare(`SELECT * FROM episode_assets WHERE episode_id=? AND (?='all' OR status=?) ORDER BY id`).all(episodeId, status, status);
    return (rows as any[]).map(row => this.rowToAsset(row));
  }

  latestValid(episodeId: number, kind: AssetKind): EpisodeAsset | null {
    const row = this.db.prepare(`SELECT * FROM episode_assets WHERE episode_id=? AND kind=? AND status='valid' ORDER BY id DESC LIMIT 1`).get(episodeId, kind);
    return row ? this.rowToAsset(row) : null;
  }

  setOutputMp4(episodeId: number, assetId: number): void {
    this.db.prepare(`UPDATE episodes SET output_mp4_asset_id=?, updated_at=? WHERE id=?`).run(assetId, new Date().toISOString(), episodeId);
  }

  approve(episodeId: number, assetId: number): Episode {
    const episode = this.getEpisode(episodeId);
    if (episode.status !== 'REVIEW_READY') throw new Error(`Episode ${episodeId} must be REVIEW_READY to approve (is ${episode.status})`);
    const asset = this.getAsset(assetId);
    if (asset.episodeId !== episodeId || asset.kind !== 'mp4' || asset.status !== 'valid') {
      throw new Error(`Asset ${assetId} is not a valid MP4 for episode ${episodeId}`);
    }
    if (episode.outputMp4AssetId !== assetId) {
      throw new Error(`Asset ${assetId} is not the current assembled MP4 (current is ${episode.outputMp4AssetId})`);
    }
    assertTransition(episode.status, 'APPROVED');
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE episodes SET status='APPROVED', approved_asset_id=?, error=NULL, updated_at=? WHERE id=?`).run(assetId, now, episodeId);
    return this.getEpisode(episodeId);
  }

  upsertTask(input: {
    episodeId: number;
    step: TaskStep;
    segmentIndex?: number;
    status: TaskStatus;
    provider?: string | null;
    providerRequestId?: string | null;
    error?: string | null;
    inputHash?: string | null;
    incrementAttempts?: boolean;
  }): EpisodeTask {
    const segmentIndex = input.segmentIndex ?? 0;
    const now = new Date().toISOString();
    const existing = this.db.prepare(`SELECT * FROM episode_tasks WHERE episode_id=? AND step=? AND segment_index=?`)
      .get(input.episodeId, input.step, segmentIndex) as any;
    if (!existing) {
      const info = this.db.prepare(`INSERT INTO episode_tasks(episode_id,step,segment_index,status,attempts,provider,provider_request_id,error,input_hash,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .run(input.episodeId, input.step, segmentIndex, input.status, input.incrementAttempts ? 1 : 0, input.provider ?? null, input.providerRequestId ?? null, input.error ?? null, input.inputHash ?? null, now, now);
      return this.getTask(Number(info.lastInsertRowid));
    }
    this.db.prepare(`UPDATE episode_tasks SET status=?, attempts=attempts+?, provider=COALESCE(?,provider), provider_request_id=COALESCE(?,provider_request_id), error=?, input_hash=COALESCE(?,input_hash), updated_at=? WHERE id=?`)
      .run(input.status, input.incrementAttempts ? 1 : 0, input.provider ?? null, input.providerRequestId ?? null, input.error ?? null, input.inputHash ?? null, now, existing.id);
    return this.getTask(existing.id);
  }

  getTask(id: number): EpisodeTask {
    const row = this.db.prepare(`SELECT * FROM episode_tasks WHERE id=?`).get(id) as any;
    if (!row) throw new Error(`Task ${id} not found`);
    return this.rowToTask(row);
  }

  findTask(episodeId: number, step: TaskStep, segmentIndex = 0): EpisodeTask | null {
    const row = this.db.prepare(`SELECT * FROM episode_tasks WHERE episode_id=? AND step=? AND segment_index=?`).get(episodeId, step, segmentIndex);
    return row ? this.rowToTask(row) : null;
  }

  listTasks(episodeId: number): EpisodeTask[] {
    return (this.db.prepare(`SELECT * FROM episode_tasks WHERE episode_id=? ORDER BY id`).all(episodeId) as any[]).map(row => this.rowToTask(row));
  }

  addUsage(input: {
    episodeId: number;
    taskId?: number | null;
    provider: string;
    kind: string;
    costKind: CostKind;
    estimatedUsd?: number | null;
    confirmedUsd?: number | null;
    units?: number | null;
    unitKind?: string | null;
    inFlight?: boolean;
    providerRequestId?: string | null;
  }): void {
    this.db.prepare(`INSERT INTO episode_usage(episode_id,task_id,provider,kind,cost_kind,estimated_usd,confirmed_usd,units,unit_kind,in_flight,provider_request_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(input.episodeId, input.taskId ?? null, input.provider, input.kind, input.costKind, input.estimatedUsd ?? null, input.confirmedUsd ?? null, input.units ?? null, input.unitKind ?? null, input.inFlight ? 1 : 0, input.providerRequestId ?? null, new Date().toISOString());
  }

  clearInFlight(providerRequestId: string): void {
    this.db.prepare(`UPDATE episode_usage SET in_flight=0 WHERE provider_request_id=?`).run(providerRequestId);
  }

  episodeSpend(episodeId: number): { estimated: number; confirmed: number; unknown: number; inFlight: number } {
    const row = this.db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN cost_kind='estimated' THEN COALESCE(estimated_usd,0) ELSE 0 END),0) estimated,
      COALESCE(SUM(CASE WHEN cost_kind='confirmed' THEN COALESCE(confirmed_usd, estimated_usd, 0) ELSE 0 END),0) confirmed,
      SUM(CASE WHEN cost_kind='unknown' THEN 1 ELSE 0 END) unknown,
      SUM(CASE WHEN in_flight=1 THEN 1 ELSE 0 END) in_flight
      FROM episode_usage WHERE episode_id=?`).get(episodeId) as any;
    return { estimated: row.estimated, confirmed: row.confirmed, unknown: row.unknown, inFlight: row.in_flight };
  }

  globalSpend(periodDays: number): { estimated: number; confirmed: number; unknown: number } {
    const row = this.db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN cost_kind='estimated' THEN COALESCE(estimated_usd,0) ELSE 0 END),0) estimated,
      COALESCE(SUM(CASE WHEN cost_kind='confirmed' THEN COALESCE(confirmed_usd, estimated_usd, 0) ELSE 0 END),0) confirmed,
      SUM(CASE WHEN cost_kind='unknown' THEN 1 ELSE 0 END) unknown
      FROM episode_usage WHERE created_at >= datetime('now', ?)`).get(`-${periodDays} days`) as any;
    return { estimated: row.estimated, confirmed: row.confirmed, unknown: row.unknown };
  }

  upsertPublication(input: {
    episodeId: number;
    destination: StoryDestination;
    status: PublicationStatus;
    providerId?: string | null;
    scheduledAt?: string | null;
    error?: string | null;
    caption?: string | null;
    mediaUrl?: string | null;
    assetId?: number | null;
  }): EpisodePublication {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO episode_publications(episode_id,destination,status,provider_id,scheduled_at,error,caption,media_url,asset_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(episode_id,destination) DO UPDATE SET
        status=excluded.status,
        provider_id=COALESCE(excluded.provider_id, episode_publications.provider_id),
        scheduled_at=COALESCE(excluded.scheduled_at, episode_publications.scheduled_at),
        error=excluded.error,
        caption=COALESCE(excluded.caption, episode_publications.caption),
        media_url=COALESCE(excluded.media_url, episode_publications.media_url),
        asset_id=COALESCE(excluded.asset_id, episode_publications.asset_id),
        updated_at=excluded.updated_at`)
      .run(input.episodeId, input.destination, input.status, input.providerId ?? null, input.scheduledAt ?? null, input.error ?? null, input.caption ?? null, input.mediaUrl ?? null, input.assetId ?? null, now, now);
    return this.getPublication(input.episodeId, input.destination)!;
  }

  getPublication(episodeId: number, destination: StoryDestination): EpisodePublication | null {
    const row = this.db.prepare(`SELECT * FROM episode_publications WHERE episode_id=? AND destination=?`).get(episodeId, destination);
    return row ? this.rowToPublication(row) : null;
  }

  listPublications(episodeId: number): EpisodePublication[] {
    return (this.db.prepare(`SELECT * FROM episode_publications WHERE episode_id=? ORDER BY destination`).all(episodeId) as any[])
      .map(row => this.rowToPublication(row));
  }

  private rowToAsset(row: any): EpisodeAsset {
    return {
      id: row.id,
      episodeId: row.episode_id,
      kind: row.kind,
      status: row.status,
      path: row.path,
      publicUrl: row.public_url,
      durationMs: row.duration_ms,
      width: row.width,
      height: row.height,
      mime: row.mime,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
      checksum: row.checksum,
      createdAt: row.created_at,
    };
  }

  private rowToTask(row: any): EpisodeTask {
    return {
      id: row.id,
      episodeId: row.episode_id,
      step: row.step,
      segmentIndex: row.segment_index,
      status: row.status,
      attempts: row.attempts,
      provider: row.provider,
      providerRequestId: row.provider_request_id,
      error: row.error,
      inputHash: row.input_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToPublication(row: any): EpisodePublication {
    return {
      id: row.id,
      episodeId: row.episode_id,
      destination: row.destination,
      status: row.status,
      providerId: row.provider_id,
      scheduledAt: row.scheduled_at,
      error: row.error,
      caption: row.caption,
      mediaUrl: row.media_url,
      assetId: row.asset_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
