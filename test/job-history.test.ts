import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { postedJobHistory } from '../src/job-selection.js';
import { shouldSkipForHistory } from '../src/post-quality.js';
import { normalize } from '../src/normalize.js';

const now = Date.parse('2026-11-13T22:00:00Z');
const job = normalize({ externalId:'111',source:'greenhouse',company:'Anthropic',title:'Senior Data Engineer',url:'https://job-boards.greenhouse.io/anthropic/jobs/111',location:'San Francisco, CA',description:'Build data pipelines' });

describe('strict rotation and 14-day company/title protection', () => {
  it('blocks a company when it appears among the previous two posts, allows it after two other companies', () => {
    const recent = [
      { company:'Reddit', title:'Machine Learning Engineer',url:'https://reddit.com/job/1',text:'a' },
      { company:'Anthropic',title:'Different Research Scientist',url:'https://anthropic.com/job/3',text:'b' },
      { company:'Figma',title:'Data Scientist',url:'https://figma.com/job/2',text:'c' },
    ];
    expect(shouldSkipForHistory(job,'',recent,recent.slice(0,2))).toMatch(/max 1 of 3/);
    expect(shouldSkipForHistory(job,'',recent,[recent[0],recent[2]])).toBeNull();
    expect(shouldSkipForHistory(job,'',recent,[recent[2],recent[1]])).toMatch(/max 1 of 3/);
  });

  it('filters title duplicates through the entire 14-day window even when URL changes', () => {
    const db=new Database(':memory:');
    try {
      db.exec(`CREATE TABLE jobs(id INTEGER PRIMARY KEY, company TEXT,title TEXT,url TEXT);
        CREATE TABLE publications(id INTEGER PRIMARY KEY, job_id INTEGER,network TEXT,status TEXT,text TEXT,created_at TEXT,due_at TEXT);`);
      const insert=(id:number,company:string,title:string,url:string,date:string,status='published')=>{
        db.prepare('INSERT INTO jobs(id,company,title,url) VALUES(?,?,?,?)').run(id,company,title,url);
        db.prepare('INSERT INTO publications(job_id,network,status,text,created_at) VALUES(?,?,?,?,?)').run(id,'x',status,`Post ${id}`,date);
      };
      insert(1,'Anthropic','Senior Data Engineer','https://example.com/old-ats','2026-11-02T15:00:00Z');
      insert(2,'Figma','Research Scientist','https://figma.com/jobs/research','2026-11-12T10:00:00Z');
      insert(3,'Reddit','ML Engineer','https://reddit.com/jobs/ml','2026-11-13T10:00:00Z','queued');
      const history=postedJobHistory(db,'x',now);
      expect(history.recent).toHaveLength(3);
      expect(history.lastTwo.map(j=>j.company)).toEqual(['Reddit','Figma']);
      expect(shouldSkipForHistory(job,'',history.recent,history.lastTwo)).toMatch(/same company and job title.*14 days/);
      // The identical role is eligible again after 14 days, with two unrelated posts in between.
      const after=postedJobHistory(db,'x',Date.parse('2026-11-17T16:00:00Z'));
      expect(after.recent.map(j=>j.company)).not.toContain('Anthropic');
      expect(shouldSkipForHistory(job,'',after.recent,after.lastTwo)).toBeNull();
      // Last two posted identities must be checked even if >14 days old.
      const muchLater=postedJobHistory(db,'x',Date.parse('2026-12-15T16:00:00Z'));
      expect(muchLater.recent).toHaveLength(0);
      expect(muchLater.lastTwo).toHaveLength(2);
      expect(shouldSkipForHistory(normalize({...job,company:'Figma',url:'https://figma.com/brand-new'}),'',muchLater.recent,muchLater.lastTwo)).toMatch(/max 1 of 3/);
    } finally { db.close(); }
  });
});
