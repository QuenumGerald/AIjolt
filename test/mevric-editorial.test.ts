import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { assessEditorialStory, isSameNewsEvent } from '../src/mevric-editorial.js';
import { selectEditorialStory } from '../src/mevric.js';

const story = (title: string, publisher = 'NPR', url?: string, publishedAt = '2026-11-04T12:00:00Z') => ({
  title, publisher, url: url ?? `https://example.com/${encodeURIComponent(title)}`, publishedAt,
});

describe('Mevric US-focused editorial filter', () => {
  it('prioritizes American political and nationally significant news regardless of outlet', () => {
    const election = assessEditorialStory(story('Democrats gain control of the U.S. Senate', 'BBC'));
    const economy = assessEditorialStory(story('Dow plunges as new U.S. tariffs spark Wall Street selloff', 'ABC News'));
    const world = assessEditorialStory(story('Ukraine says bodycam video shows deadly Russian double-tap bombing', 'BBC'));
    expect(election).toMatchObject({eligible:true,reason:'us_politics'});
    expect(economy.eligible).toBe(true);
    expect(world).toMatchObject({eligible:true,reason:'major_world_event'});
    expect(election.priority).toBeGreaterThan(world.priority);
  });

  it('rejects minor crime, local irrelevance, routine foreign news and repeated media clips', () => {
    for (const title of [
      'Police investigate petty theft in a small Texas neighborhood',
      'New restaurant opens near a local California school',
      'WATCH: Democrats projected to take control of the House',
      'LIVE: 2026 midterm elections: ABC News Live',
      'Leisure centre price hikes on the way',
      'South Africans vote in local elections',
      'Local council meeting considers parking fines',
      'Review: The Legend of Zelda remake is superb',
      'US Marine dies after training incident in Japan',
    ]) expect(assessEditorialStory(story(title)).eligible, title).toBe(false);
  });

  it('does not confuse breaking news with a minor or irrelevant local item', () => {
    expect(assessEditorialStory(story('BREAKING: Minor traffic closure in a local village')).eligible).toBe(false);
    expect(assessEditorialStory(story('Earthquake destroys buildings and causes major damage overseas')).eligible).toBe(true);
    expect(assessEditorialStory(story('Mississippi chemical plant explosion injures dozens')).eligible).toBe(true);
  });

  it('deduplicates near-identical stories across news outlets, without suppressing unrelated elections', () => {
    expect(isSameNewsEvent(story('Democrat Abdul El-Sayed defeats Republican Mike Rogers in Michigan Senate race'),
      story('Democrat Abdul El-Sayed defeats Republican Mike Rogers in key Michigan Senate race', 'BBC'))).toBe(true);
    expect(isSameNewsEvent(story('Democrats gain control of House after flipping Republican seats'),
      story('Democrats take control of the House', 'ABC News'))).toBe(true);
    expect(isSameNewsEvent(story('Democrats projected to take control of the House'),
      story('Democrats take control of the House'))).toBe(false);
    expect(isSameNewsEvent(story('Democrat wins Michigan Senate race'),
      story('Democrat wins Texas Senate race'))).toBe(false);
    expect(isSameNewsEvent(story('New election result in Michigan'),
      story('Ukraine announces ceasefire agreement'))).toBe(false);
  });

  it('selects US politics over a newer minor local story and suppresses previously posted events', () => {
    const db = new Database(':memory:');
    try {
      db.exec(`CREATE TABLE stories (url TEXT PRIMARY KEY, title TEXT, publisher TEXT, published_at TEXT, status TEXT DEFAULT 'new', media_url TEXT, media_kind TEXT, attempted_at TEXT)`);
      const add = db.prepare('INSERT INTO stories(url,title,publisher,published_at,status,attempted_at) VALUES (?,?,?,?,?,?)');
      const now = '2026-11-04T15:00:00Z';
      const relevant = story('U.S. Congress passes major election reform bill', 'NPR', 'https://npr.org/politics', '2026-11-04T12:00:00Z');
      const local = story('Council votes on new parking rates in a small English town', 'BBC', 'https://bbc.co.uk/local', '2026-11-04T14:45:00Z');
      const global = story('Ukraine says deadly Russian missile attacks hit Kyiv', 'BBC', 'https://bbc.co.uk/world', '2026-11-04T14:30:00Z');
      for (const s of [relevant, local, global]) add.run(s.url,s.title,s.publisher,s.publishedAt,'new',null);
      expect(selectEditorialStory(db,Date.parse(now))?.url).toBe(relevant.url);
      db.prepare("UPDATE stories SET status='queued',attempted_at=? WHERE url=?").run(now, relevant.url);
      const repeated = story('U.S. Congress passes major election reform bill in historic vote', 'ABC News', 'https://abcnews.com/politics', '2026-11-04T14:50:00Z');
      add.run(repeated.url,repeated.title,repeated.publisher,repeated.publishedAt,'new',null);
      expect(selectEditorialStory(db,Date.parse(now))?.url).toBe(global.url);
      // Filtering is non-destructive: excluded stories remain available if policy changes.
      expect(db.prepare('SELECT status FROM stories WHERE url=?').get(local.url)).toEqual({status:'new'});
    } finally { db.close(); }
  });
});
