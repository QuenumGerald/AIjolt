import type { PopSource } from './types.js';

/** Non-YouTube discovery inputs. Only publisher-declared native videos enter the queue.
 * YouTube feeds and KinoCheck (YouTube-only URLs) are intentionally excluded.
 * TMZ currently denies this server (HTTP 403); do not bypass its access controls. */
export const POP_SOURCES: PopSource[] = [
  { id: 'et-video', publisher: 'Entertainment Tonight', url: 'https://www.etonline.com/recent/video', kind: 'et-video', defaultCategory: 'news' },
  { id: 'variety-video', publisher: 'Variety', url: 'https://variety.com/v/video/feed/', kind: 'rss' },
  { id: 'deadline-video', publisher: 'Deadline', url: 'https://deadline.com/video/feed/', kind: 'rss' },
  { id: 'consequence-video', publisher: 'Consequence', url: 'https://consequence.net/video/feed/', kind: 'rss' },
  { id: 'joblo-trailers', publisher: 'JoBlo', url: 'https://www.joblo.com/category/movie-trailers/feed/', kind: 'rss', defaultCategory: 'trailer' },
  { id: 'variety', publisher: 'Variety', url: 'https://variety.com/feed/', kind: 'rss' },
  { id: 'deadline', publisher: 'Deadline', url: 'https://deadline.com/feed/', kind: 'rss' },
  { id: 'hollywood-reporter', publisher: 'Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/', kind: 'rss' },
  { id: 'billboard', publisher: 'Billboard', url: 'https://www.billboard.com/feed/', kind: 'rss' },
  { id: 'rolling-stone-music', publisher: 'Rolling Stone', url: 'https://www.rollingstone.com/music/music-news/feed/', kind: 'rss' },
  { id: 'rolling-stone-film', publisher: 'Rolling Stone', url: 'https://www.rollingstone.com/tv-movies/tv-movie-news/feed/', kind: 'rss' },
  { id: 'pitchfork', publisher: 'Pitchfork', url: 'https://pitchfork.com/rss/news/', kind: 'rss' },
  { id: 'bbc-entertainment', publisher: 'BBC', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', kind: 'rss' },
  { id: 'npr-music', publisher: 'NPR Music', url: 'https://feeds.npr.org/1039/rss.xml', kind: 'rss' },
  { id: 'guardian-film', publisher: 'The Guardian', url: 'https://www.theguardian.com/film/rss', kind: 'rss' },
  { id: 'guardian-music', publisher: 'The Guardian', url: 'https://www.theguardian.com/music/rss', kind: 'rss' },
  { id: 'guardian-tv', publisher: 'The Guardian', url: 'https://www.theguardian.com/tv-and-radio/rss', kind: 'rss' },
  { id: 'indiewire', publisher: 'IndieWire', url: 'https://www.indiewire.com/feed/', kind: 'rss' },
  { id: 'nme', publisher: 'NME', url: 'https://www.nme.com/feed', kind: 'rss' },
  { id: 'the-wrap', publisher: 'The Wrap', url: 'https://www.thewrap.com/feed/', kind: 'rss' },
  { id: 'consequence', publisher: 'Consequence', url: 'https://consequence.net/feed/', kind: 'rss' },
  { id: 'stereogum', publisher: 'Stereogum', url: 'https://www.stereogum.com/feed/', kind: 'rss' },
  { id: 'golden-globes', publisher: 'Golden Globes', url: 'https://goldenglobes.com/feed/', kind: 'rss' },
  { id: 'netflix-press', publisher: 'Netflix', url: 'https://about.netflix.com/en/feed.xml', kind: 'rss' },
  { id: 'moviefone-news', publisher: 'Moviefone', url: 'https://www.moviefone.com/feeds/news.json', kind: 'json-feed' },
  { id: 'moviefone-trailers', publisher: 'Moviefone', url: 'https://www.moviefone.com/feeds/trailers.json', kind: 'json-feed', defaultCategory: 'trailer' },
  { id: 'moviefone-interviews', publisher: 'Moviefone', url: 'https://www.moviefone.com/feeds/interviews.json', kind: 'json-feed' },
];
