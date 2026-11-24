import { rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { bufferGetPostPayload, classifyBufferPostResponse } from '../buffer.js';
import type { PopConfig } from './config.js';

/** Only delete files created by this bot under its configured public media directory. */
export function hostedMediaPath(url: string, config: PopConfig): string | null {
  if (!config.mediaBaseUrl) return null;
  try {
    const base = new URL(config.mediaBaseUrl.endsWith('/') ? config.mediaBaseUrl : `${config.mediaBaseUrl}/`);
    const file = new URL(url);
    if (file.origin !== base.origin || file.search || file.hash || !file.pathname.startsWith(base.pathname)) return null;
    const name = file.pathname.slice(base.pathname.length);
    if (!/^(?:[a-f0-9]{24}|klieg-edit-[a-f0-9]{24})\.mp4$/.test(name)) return null;
    return join(config.mediaDirectory, name);
  } catch { return null; }
}

export async function reconcilePop(db: Database.Database, config: PopConfig): Promise<string[]> {
  const logs: string[] = [];
  if (!config.bufferToken) return logs;
  const rows = db.prepare("SELECT item_id,provider_id,video_url,status FROM pop_publications WHERE status IN ('queued','published') AND provider_id IS NOT NULL").all() as Array<{item_id:number;provider_id:string;video_url:string|null;status:string}>;
  for (const row of rows) {
    if (row.status === 'queued') {
      try {
        const response = await fetch('https://api.buffer.com', {method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${config.bufferToken}`},body:JSON.stringify(bufferGetPostPayload(row.provider_id)),signal:AbortSignal.timeout(20_000)});
        if (!response.ok) { logs.push(`Buffer status HTTP ${response.status} for #${row.item_id}`); continue; }
        const state = classifyBufferPostResponse(await response.json());
        if (state.kind !== 'published') continue;
        db.transaction(() => {
          db.prepare("UPDATE pop_publications SET status='published' WHERE item_id=? AND status='queued'").run(row.item_id);
          db.prepare("UPDATE pop_items SET status='published' WHERE id=? AND status='queued'").run(row.item_id);
        })();
      } catch { logs.push(`Buffer status unavailable for #${row.item_id}`); continue; }
    }
    const path = row.video_url && hostedMediaPath(row.video_url, config);
    if (!path) continue;
    const inUse = db.prepare("SELECT 1 FROM pop_publications WHERE video_url=? AND status IN ('queued','attempted') LIMIT 1").get(row.video_url);
    const waiting = db.prepare("SELECT 1 FROM pop_items WHERE video_url=? AND status IN ('ready','attempted','queued') LIMIT 1").get(row.video_url);
    if (inUse || waiting) continue;
    // rm(force:true) succeeds even when the file is already gone: do not
    // generate a fake deletion/failure on every collection cycle.
    try { await stat(path); } catch { continue; }
    try { await rm(path, {force:true}); }
    catch { logs.push(`could not delete published video for #${row.item_id}; will retry`); }
  }
  return logs;
}
