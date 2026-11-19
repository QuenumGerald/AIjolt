import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { isHotUsAlert } from '../src/mevric-editorial.js';
import { alertCount24h, postKind, publishingGate, selectEditorialStory, formatPost, MEVRIC_24H_ALERT_LIMIT, MEVRIC_24H_POST_LIMIT, MEVRIC_POST_SPACING_MINUTES } from '../src/mevric.js';

const at = (date: number) => new Date(date).toISOString();
const story = (title:string,publishedAt:string, url='https://www.foxnews.com/us/abc') => ({ title,url,publishedAt,publisher:'Fox News' });
function dbFixture() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE stories(url TEXT PRIMARY KEY,title TEXT,publisher TEXT,published_at TEXT,status TEXT DEFAULT 'new',media_url TEXT,media_kind TEXT,attempted_at TEXT,post_kind TEXT);`);
  return db;
}

// The clock is fixed so that the entire test is independent of when it runs.
const now = Date.parse('2026-11-19T12:00:00Z');
const tampa = story('Active shooter reported at office complex near Tampa, Florida',at(now-5*60_000));
const politics = story('U.S. Senate debates a new national security bill',at(now-2*60_000),'https://www.foxnews.com/politics/new-bill');

describe('Mevric 40-50 post/day normal pace with priority alerts',()=>{
  it('reserves ALERT for severe fresh US events, never routine politics, foreign events, or old cases',()=>{
    expect(isHotUsAlert(tampa,now)).toBe(true);
    expect(isHotUsAlert(politics,now)).toBe(false);
    expect(isHotUsAlert(story('Active shooter reported in London, England',at(now-60_000)),now)).toBe(false);
    expect(isHotUsAlert(story('U.S. embassy reports bombing in Iraq',at(now-60_000)),now)).toBe(false);
    expect(isHotUsAlert(story('Florida bank shooting suspect convicted after trial',at(now-60_000)),now)).toBe(false);
    expect(isHotUsAlert(story('Major explosion at Texas chemical plant',at(now-91*60_000)),now)).toBe(false);
    expect(isHotUsAlert(story('Major explosion at Texas chemical plant',at(now-90*60_000)),now)).toBe(true);
    expect(formatPost(politics)).toBe(`${politics.title}\n${politics.url}\n#News`);
    expect(formatPost(tampa,tampa.title,true)).toBe(`ALERT 🚨\n${tampa.title}\n${tampa.url}\n#News`);
  });

  it('uses the five-alert cap over a rolling 24h window, including legacy all-ALERT posts',()=>{
    const db=dbFixture();
    try {
      for(let i=0;i<4;i++) db.prepare('INSERT INTO stories(url,title,publisher,published_at,status,attempted_at,post_kind) VALUES(?,?,?,?,?,?,?)')
        .run('https://npr.org/old-'+i,'Historical', 'NPR',at(now-3*3600_000),'queued',at(now-2*3600_000), i===0?null:'alert');
      expect(alertCount24h(db,now)).toBe(4);
      expect(postKind(db,tampa,now)).toBe('alert');
      db.prepare('INSERT INTO stories(url,title,publisher,published_at,status,attempted_at,post_kind) VALUES(?,?,?,?,?,?,?)')
        .run('https://npr.org/old-5','Historical','NPR',at(now-3*3600_000),'queued',at(now-2*3600_000),'alert');
      expect(alertCount24h(db,now)).toBe(MEVRIC_24H_ALERT_LIMIT);
      expect(postKind(db,tampa,now)).toBe('news');
      expect(formatPost(tampa,tampa.title,postKind(db,tampa,now)==='alert')).not.toContain('ALERT');
      expect(publishingGate(db,now,true).allowed).toBe(false);
      expect(publishingGate(db,now,false).allowed).toBe(true);
      db.prepare('UPDATE stories SET attempted_at=?').run(at(now-25*3600_000));
      expect(alertCount24h(db,now)).toBe(0);
      expect(postKind(db,tampa,now)).toBe('alert');
    } finally {db.close();}
  });

  it('allows a hot US incident to preempt a 30-minute regular slot after only 2 minutes',()=>{
    const db=dbFixture();
    try {
      const add=db.prepare('INSERT INTO stories(url,title,publisher,published_at,status,attempted_at,post_kind) VALUES(?,?,?,?,?,?,?)');
      add.run('https://npr.org/bill',politics.title,'NPR',at(now),'queued',at(now),'news');
      expect(publishingGate(db,now+60_000,true).allowed).toBe(false);
      expect(publishingGate(db,now+2*60_000,true).allowed).toBe(true);
      add.run('https://foxnews.com/shooting',tampa.title,'Fox News',at(now),'queued',at(now+2*60_000),'alert');
      expect(publishingGate(db,now+3*60_000,false).allowed).toBe(false);
      expect(publishingGate(db,now+30*60_000,false).allowed).toBe(true);
    } finally {db.close();}
  });

  it('supports 48 well-spaced ordinary posts in 24h, then stops at 50 total with urgent alerts',()=>{
    const db=dbFixture();
    try {
      expect(MEVRIC_24H_POST_LIMIT).toBe(50);
      expect(MEVRIC_POST_SPACING_MINUTES).toBe(30);
      const insert=db.prepare('INSERT INTO stories(url,title,publisher,published_at,status,attempted_at,post_kind) VALUES(?,?,?,?,?,?,?)');
      const start=Date.parse('2026-11-19T00:00:00Z');
      for(let i=0;i<48;i++) {
        const when=start+i*30*60_000;
        expect(publishingGate(db,when,false).allowed, `ordinary slot ${i}`).toBe(true);
        insert.run(`https://npr.org/regular/${i}`,'News','NPR',at(when),'queued',at(when),'news');
      }
      for(let i=0;i<2;i++) {
        const when=start+(47*30+2+i*2)*60_000;
        expect(publishingGate(db,when,true).allowed,`alert slot ${i}`).toBe(true);
        insert.run(`https://foxnews.com/alerts/${i}`,'Urgent','Fox News',at(when),'queued',at(when),'alert');
      }
      const after=start+(47*30+6)*60_000;
      expect(publishingGate(db,after,false)).toMatchObject({allowed:false,count:50});
      expect(publishingGate(db,after,true)).toMatchObject({allowed:false,count:50});
    } finally {db.close();}
  });

  it('prioritizes fresh US emergencies over routine politics, then favors fresher news',()=>{
    const db=dbFixture();
    try {
      const insert=db.prepare('INSERT INTO stories(url,title,publisher,published_at) VALUES(?,?,?,?)');
      const elderly=story('U.S. Congress discusses federal budget',at(now-7*3600_000),'https://www.foxnews.com/politics/old');
      const recent=story('U.S. lawmakers introduce a federal policy plan',at(now-60_000),'https://www.foxnews.com/politics/new');
      for(const s of [elderly,recent,tampa])insert.run(s.url,s.title,s.publisher,s.publishedAt);
      expect(selectEditorialStory(db,now)?.url).toBe(tampa.url);
      db.prepare("UPDATE stories SET status='queued',attempted_at=? WHERE url=?").run(at(now),tampa.url);
      expect(selectEditorialStory(db,now)?.url).toBe(recent.url);
    } finally {db.close();}
  });
});
