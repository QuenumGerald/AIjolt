import { describe, expect, it } from 'vitest';
import { popConfig } from '../src/popculture/config.js';
import { montageHeadline, MONTAGE_MAX_SECONDS, renderKliegMontage } from '../src/popculture/montage.js';
import { assessVideo } from '../src/popculture/video.js';

const source = assessVideo({url:'https://cdn.example.com/video.mp4',durationSeconds:100});

describe('Klieg montage safety and branding', () => {
  it('keeps the full X headline outside the overlay, while limiting its visual width', () => {
    const title='A very long real-life headline about the latest important news story with multiple details and reactions';
    const lines=montageHeadline(title).split('\n');
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines.every(line=>line.length <= 43)).toBe(true);
    expect(montageHeadline('  headline   about science ')).toBe('headline about science');
    expect(montageHeadline('')).toBe('KLIEG VIDEO');
    expect(montageHeadline('A'.repeat(140)).length).toBeLessThan(50);
  });

  it('is opt-in so existing production runs do not change without an explicit switch', async () => {
    expect(await renderKliegMontage(source,'Test title',popConfig({}))).toBe(source);
  });

  it('never produces edited content without dedicated public HTTPS hosting', async () => {
    const c=popConfig({POPCULTURE_MONTAGE_ENABLED:'true'});
    await expect(renderKliegMontage(source,'Test title',c)).rejects.toThrow('media HTTPS hosting');
  });

  it('refuses player pages and non-public local media even when editing is enabled', async () => {
    const config=popConfig({POPCULTURE_MONTAGE_ENABLED:'true',POPCULTURE_MEDIA_BASE_URL:'https://media.example.com/'});
    await expect(renderKliegMontage(assessVideo({url:'https://www.youtube.com/watch?v=abcdefghijk'}),'Test title',config)).rejects.toThrow('native HTTPS');
    await expect(renderKliegMontage(assessVideo({url:'https://127.0.0.1/video.mp4'}),'Test title',config)).rejects.toThrow('native HTTPS');
    expect(MONTAGE_MAX_SECONDS).toBe(60);
  });
});
