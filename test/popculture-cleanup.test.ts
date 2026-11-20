import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { popConfig } from '../src/popculture/config.js';
import { reconcilePop } from '../src/popculture/reconcile.js';
import { openPopDb, upsertItem } from '../src/popculture/store.js';
import { assessVideo } from '../src/popculture/video.js';

const dir = mkdtempSync(join(tmpdir(), 'pop-cleanup-'));
afterEach(() => { vi.unstubAllGlobals(); rmSync(dir, {recursive:true,force:true}); });
it('keeps a queued video and removes it only after Buffer confirms publication', async () => {
  const name = '0123456789abcdef01234567.mp4';
  const url = `https://media.example.com/${name}`;
  const file = join(dir, name);
  writeFileSync(file, 'video');
  const config = popConfig({POPCULTURE_MEDIA_DIRECTORY:dir,POPCULTURE_MEDIA_BASE_URL:'https://media.example.com/',POPCULTURE_BUFFER_ACCESS_TOKEN:'token'});
  const db = openPopDb(':memory:');
  upsertItem(db, {source:'test',externalId:'1',url:'https://example.com/story',title:'Film trailer test',summary:'',publisher:'Test',category:'trailer',publishedAt:new Date().toISOString(),score:80,status:'ready',rejection:null,postText:'Film trailer test',video:assessVideo({url})});
  db.prepare("UPDATE pop_items SET status='queued' WHERE id=1").run();
  db.prepare("INSERT INTO pop_publications(item_id,status,text,video_url,provider_id,created_at) VALUES(1,'queued','text',?,'post1',?)").run(url,new Date().toISOString());
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({data:{post:{status:'pending'}}}))).mockResolvedValueOnce(new Response(JSON.stringify({data:{post:{status:'sent'}}})));
  vi.stubGlobal('fetch',fetch);
  await reconcilePop(db,config);
  expect(existsSync(file)).toBe(true);
  await reconcilePop(db,config);
  expect(existsSync(file)).toBe(false);
  expect((db.prepare('SELECT status FROM pop_publications').get() as {status:string}).status).toBe('published');
  db.close();
});

it('counts only publications from the last 24 hours even with ISO timestamps', async () => {
  const { recentPublishCount } = await import('../src/popculture/store.js');
  const db = openPopDb(':memory:');
  for (const [index, hours] of [1, 25].entries()) {
    const url = `https://media.example.com/${index}.mp4`;
    upsertItem(db, {source:'test',externalId:String(index),url:`https://example.com/${index}`,title:`Film test item ${index}`,summary:'',publisher:'Test',category:'trailer',publishedAt:new Date().toISOString(),score:80,status:'ready',rejection:null,postText:'text',video:assessVideo({url})});
    db.prepare("INSERT INTO pop_publications(item_id,status,text,created_at) VALUES(?,'queued','text',?)").run(index + 1,new Date(Date.now()-hours*3600000).toISOString());
  }
  expect(recentPublishCount(db)).toBe(1);
  db.close();
});
