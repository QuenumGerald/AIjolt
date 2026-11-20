import { assessVideo } from './video.js';
import type { VideoAssessment } from './types.js';

/** Only publisher-declared VideoObjects and explicit YouTube embeds, never background videos or ads. */
export function extractArticleVideo(html: string): VideoAssessment | null {
  const videos: Record<string, unknown>[] = [];
  function walk(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(walk); return; }
    if (!value || typeof value !== 'object') return;
    const node = value as Record<string, unknown>;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.includes('VideoObject')) videos.push(node);
    for (const [key, child] of Object.entries(node)) if (key === '@graph' || key === 'video' || key === 'mainEntity') walk(child);
  }
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1])); } catch { /* One malformed block must not hide other blocks. */ }
  }
  for (const node of videos) {
    const url = typeof node.contentUrl === 'string' ? node.contentUrl : typeof node.embedUrl === 'string' ? node.embedUrl : null;
    if (!url) continue;
    const normalized = normalizeYouTubeEmbed(url);
    return assessVideo({ url: normalized });
  }
  const embed = html.match(/<iframe\b[^>]*src=["'](https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[\w-]{11})/i);
  return embed ? assessVideo({ url: normalizeYouTubeEmbed(embed[1]) }) : null;
}

function normalizeYouTubeEmbed(raw: string): string {
  try {
    const url = new URL(raw);
    if (['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(url.hostname)) {
      const id = url.pathname.match(/^\/embed\/([\w-]{11})$/)?.[1];
      if (id) return `https://www.youtube.com/watch?v=${id}`;
    }
  } catch { /* assessVideo rejects malformed URLs. */ }
  return raw;
}
