import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractArticleVideo } from '../src/popculture/article.js';
import { verifyNativeUrl } from '../src/popculture/native.js';

const mp4 = Buffer.from([0, 0, 0, 24, ...Buffer.from('ftypisom'), 0, 0, 0, 0]);
describe('native media validation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('accepts an actual MP4 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(mp4, {status:206, headers:{'content-type':'video/mp4','content-range':'bytes 0-15/1000'}})));
    await expect(verifyNativeUrl('https://cdn.example.com/a.mp4')).resolves.toBeUndefined();
  });
  it('refuses HTML masquerading as a video URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>not a video</html>', {headers:{'content-type':'video/mp4','content-length':'24'}})));
    await expect(verifyNativeUrl('https://cdn.example.com/a.mp4')).rejects.toThrow('not an MP4');
  });
  it('refuses private redirect targets', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, {status:302, headers:{location:'https://127.0.0.1/secret'}}));
    vi.stubGlobal('fetch', fetch);
    await expect(verifyNativeUrl('https://cdn.example.com/a.mp4')).rejects.toThrow('invalid media URL');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('extracts the declared video rather than a page background MP4', () => {
    const html = '<video src="https://example.com/background.mp4"></video><script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'VideoObject',contentUrl:'https://cdn.example.com/trailer.mp4'}]})+'</script>';
    expect(extractArticleVideo(html, 'unconfirmed')?.url).toBe('https://cdn.example.com/trailer.mp4');
    expect(extractArticleVideo('<video src="https://example.com/background.mp4"></video>', 'unconfirmed')).toBeNull();
  });
  it('normalizes explicit YouTube embeds for the downloader', () => {
    expect(extractArticleVideo('<iframe src="https://www.youtube.com/embed/abcdefghijk?rel=0"></iframe>', 'unconfirmed')?.url).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  });
});
