import { describe, expect, it } from 'vitest';
import { assessRelevance } from '../src/popculture/relevance.js';
import { POP_SOURCES } from '../src/popculture/sources.js';

describe('Klieg entertainment-only editorial gate', () => {
  it('removes generic news video discovery feeds', () => {
    expect(POP_SOURCES.map(source => source.id)).not.toContain('nbc-video');
    expect(POP_SOURCES.map(source => source.id)).not.toContain('euronews-video');
    expect(POP_SOURCES.map(source => source.id)).toContain('tmz-watch');
    expect(POP_SOURCES.map(source => source.id)).toContain('moviefone-trailers');
  });
  it.each([
    'Incredible flooding caught on camera in Spain',
    'NBC News NOW live news bulletin and weather forecast',
    'FBI arrests suspect in viral police video',
    'President unveils new tariffs after senate vote',
    'Amazing shark rescue caught on camera',
    'Incredible NASA discovery on Mars',
  ])('rejects unrelated news: %s', title => {
    expect(assessRelevance(title, '', 'news').ok).toBe(false);
  });
  it.each([
    'Taylor Swift announces new album and concert tour',
    'Marvel releases official trailer for upcoming movie',
    'Netflix unveils season 2 of popular anime series',
    'Viral TikTok dance challenge takes over the internet',
    'Streamer goes viral after hilarious gaming moment',
    'Oscars 2027 winners celebrate on red carpet',
  ])('accepts entertainment: %s', title => {
    expect(assessRelevance(title, '').ok).toBe(true);
  });
  it('does not trust source hint without editorial context', () => {
    expect(assessRelevance('Major storm hits coast', '', 'trailer').ok).toBe(false);
    expect(assessRelevance('Exclusive interview about the weather', '', 'celebrity').ok).toBe(false);
  });
});
