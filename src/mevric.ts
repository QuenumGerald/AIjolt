import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { bufferCreatePostPayload } from './buffer.js';

const feeds = [
  'https://feeds.npr.org/1001/rss.xml',
  'https://feeds.npr.org/1014/rss.xml',
  'https://feeds.npr.org/1003/rss.xml',
];
const decode = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/<[^>]*>/g, '').trim();
const tag = (item: string, name: string) => decode(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '');
export type Media = { kind: 'image' | 'video'; url: string };
export type Story = { title: string; url: string; publishedAt: string; publisher: string; media?: Media };
function feedMedia(item: string): Media | undefined {
  for (const match of item.matchAll(/<(?:media:content|media:thumbnail|enclosure)\b([^>]*?)\/?\s*>/gi)) {
    const attrs: Record<string, string> = {};
    for (const attr of match[1].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) attrs[attr[1].toLowerCase()] = decode(attr[3]);
    const kind = attrs.type?.startsWith('image/') || attrs.medium === 'image' || /^<media:thumbnail/i.test(match[0]) ? 'image' : attrs.type?.startsWith('video/') || attrs.medium === 'video' ? 'video' : undefined;
    if (!kind || !attrs.url) continue;
    try {
      const url = new URL(attrs.url);
      if (url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'npr.org' || url.hostname.endsWith('.npr.org') || url.hostname.endsWith('.npr.brightspotcdn.com'))) return { kind, url: url.href };
    } catch { /* invalid media URL */ }
  }
}
export function parseFeed(xml: string, now = Date.now()): Story[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].flatMap(([, item]) => {
    const title = tag(item, 'title').replace(/\s+/g, ' ');
    const url = tag(item, 'link');
    const published = Date.parse(tag(item, 'pubDate'));
    let validUrl = false;
    try { const parsed = new URL(url); validUrl = parsed.protocol === 'https:' && (parsed.hostname === 'npr.org' || parsed.hostname.endsWith('.npr.org')); } catch { /* invalid URL */ }
    if (!title || !validUrl || !Number.isFinite(published) || published > now || now - published > 24 * 3600_000) return [];
    return [{ title, url, publishedAt: new Date(published).toISOString(), publisher: 'NPR', media: feedMedia(item) }];
  });
}
export function formatPost(story: Story): string | null {
  const post = `${story.title}\n\nSource: ${story.publisher}\n${story.url}`;
  return Array.from(post).length <= 280 ? post : null;
}
function database() {
  const path = process.env.MEVRIC_DATABASE_PATH || './data/mevric.db';
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS stories (url TEXT PRIMARY KEY, title TEXT NOT NULL, publisher TEXT NOT NULL, published_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', provider_id TEXT, error TEXT, attempted_at TEXT);`);
  const columns = db.prepare('PRAGMA table_info(stories)').all() as { name: string }[];
  if (!columns.some(column => column.name === 'media_url')) db.exec('ALTER TABLE stories ADD COLUMN media_url TEXT');
  if (!columns.some(column => column.name === 'media_kind')) db.exec('ALTER TABLE stories ADD COLUMN media_kind TEXT');
  return db;
}
export async function collect(): Promise<void> {
  const results = await Promise.allSettled(feeds.map(async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'Mevric/1.0 (news reader)' } });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return parseFeed(await response.text());
  }));
  for (const result of results) if (result.status === 'rejected') console.error('Feed error:', result.reason);
  if (results.every(result => result.status === 'rejected')) throw new Error('All news feeds failed');
  const db = database();
  const insert = db.prepare(`INSERT INTO stories(url,title,publisher,published_at,media_url,media_kind) VALUES(?,?,?,?,?,?)
    ON CONFLICT(url) DO UPDATE SET media_url=COALESCE(excluded.media_url, stories.media_url), media_kind=CASE WHEN excluded.media_url IS NOT NULL THEN excluded.media_kind ELSE stories.media_kind END WHERE stories.status='new'`);
  let added = 0;
  for (const result of results) if (result.status === 'fulfilled') for (const story of result.value) added += insert.run(story.url, story.title, story.publisher, story.publishedAt, story.media?.url ?? null, story.media?.kind ?? null).changes;
  db.close();
  console.log(`Collected or refreshed ${added} stories`);
}
export function mediaPostPayload(text: string, channelId: string, dueAt: string, media: Media) {
  return {
    query: `mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id dueAt status } } ... on MutationError { message } } }`,
    variables: { input: { text, channelId, dueAt, schedulingType: 'automatic', mode: 'customScheduled', assets: [{ [media.kind]: { url: media.url } }] } },
  };
}
export async function publish(dryRun = true): Promise<void> {
  const db = database();
  try {
    const row = db.prepare("SELECT url,title,publisher,published_at AS publishedAt,media_url AS mediaUrl,media_kind AS mediaKind FROM stories WHERE status='new' AND published_at >= ? ORDER BY published_at DESC LIMIT 1").get(new Date(Date.now() - 24 * 3600_000).toISOString()) as (Story & { mediaUrl: string | null; mediaKind: string | null }) | undefined;
    if (!row) { console.log('No recent unpublished stories'); return; }
    const media: Media | undefined = row.mediaUrl && (row.mediaKind === 'image' || row.mediaKind === 'video') ? { kind: row.mediaKind, url: row.mediaUrl } : undefined;
    const text = formatPost(row);
    if (!text) { db.prepare("UPDATE stories SET status='skipped', error='Post exceeds 280 characters' WHERE url=?").run(row.url); console.log('Skipped an overlong headline'); return; }
    if (dryRun) { console.log(media ? `${text}\n\n${media.kind}: ${media.url}` : text); return; }
    const token = process.env.BUFFER_ACCESS_TOKEN;
    const channel = process.env.MEVRIC_BUFFER_CHANNEL_ID;
    if (!token || !channel) throw new Error('BUFFER_ACCESS_TOKEN and MEVRIC_BUFFER_CHANNEL_ID are required');
    const claimed = db.prepare("UPDATE stories SET status='attempted', attempted_at=? WHERE url=? AND status='new'").run(new Date().toISOString(), row.url);
    if (!claimed.changes) return;
    try {
      const dueAt = new Date(Date.now() + 5 * 60_000).toISOString();
      const payload = media ? mediaPostPayload(text, channel, dueAt, media) : bufferCreatePostPayload(text, channel, dueAt);
      const response = await fetch('https://api.buffer.com', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Buffer HTTP ${response.status}`);
      const body = await response.json() as { errors?: { message: string }[]; data?: { createPost?: { post?: { id?: string }; message?: string } } };
      const id = body.data?.createPost?.post?.id;
      if (!id) throw new Error(body.errors?.map(e => e.message).join('; ') || body.data?.createPost?.message || 'Buffer returned no post ID');
      db.prepare("UPDATE stories SET status='queued',provider_id=? WHERE url=?").run(id, row.url);
      console.log(`Queued ${id}`);
    } catch (error) {
      db.prepare('UPDATE stories SET error=? WHERE url=?').run(String(error), row.url);
      throw error;
    }
  } finally { db.close(); }
}
async function main() {
  const command = process.argv[2];
  if (command === 'collect') return collect();
  if (command === 'publish') return publish(process.env.DRY_RUN !== 'false' || process.argv.includes('--dry-run'));
  if (command !== 'start') throw new Error('Usage: mevric collect|publish|start [--dry-run]');
  let running = false;
  const cycle = async () => { if (running) return; running = true; try { await collect(); await publish(process.env.DRY_RUN !== 'false'); } catch (error) { console.error('Mevric cycle failed:', error); } finally { running = false; } };
  await cycle();
  setInterval(() => void cycle(), 30 * 60_000);
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main().catch(error => { console.error(error); process.exitCode = 1; });
