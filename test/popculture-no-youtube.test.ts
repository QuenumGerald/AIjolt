import { describe, expect, it } from 'vitest';
import { POP_SOURCES } from '../src/popculture/sources.js';
import { popConfig } from '../src/popculture/config.js';

describe('Klieg native video discovery', () => {
  it('never uses YouTube feeds or KinoCheck YouTube links', () => {
    expect(POP_SOURCES.some(source => source.id.startsWith('youtube-'))).toBe(false);
    expect(POP_SOURCES.some(source => source.id === 'kinocheck')).toBe(false);
    expect(POP_SOURCES.some(source => /youtube\.com|youtu\.be/.test(source.url))).toBe(false);
  });
  it('retains publisher native video feeds', () => {
    for (const id of ['et-video', 'moviefone-trailers', 'moviefone-interviews', 'variety-video', 'deadline-video', 'joblo-trailers']) {
      expect(POP_SOURCES.some(source => source.id === id)).toBe(true);
    }
  });
  it('defaults YouTube downloads to disabled', () => {
    const env = { ...process.env, POPCULTURE_MAX_VIDEO_DOWNLOADS: undefined };
    expect(popConfig(env).maxVideoDownloads).toBe(0);
  });
});
