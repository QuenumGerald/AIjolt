import type { PopSource } from './types.js';

/** Sources are discovery inputs; only resolved native videos enter the ready queue. */
export const POP_SOURCES: PopSource[] = [
  { id: 'nbc-video', publisher: 'NBC News', url: 'https://www.nbcnews.com/video', kind: 'nbc-video', videoRights: 'unconfirmed', defaultCategory: 'news' },
  { id: 'tmz-watch', publisher: 'TMZ', url: 'https://www.tmz.com/watch/', kind: 'tmz-video', videoRights: 'unconfirmed', defaultCategory: 'news' },
  { id: 'et-video', publisher: 'Entertainment Tonight', url: 'https://www.etonline.com/recent/video', kind: 'et-video', videoRights: 'unconfirmed', defaultCategory: 'news' },
  { id: 'euronews-video', publisher: 'Euronews', url: 'https://www.euronews.com/video', kind: 'euronews-video', videoRights: 'unconfirmed', defaultCategory: 'news' },
  { id: 'variety-video', publisher: 'Variety', url: 'https://variety.com/v/video/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'deadline-video', publisher: 'Deadline', url: 'https://deadline.com/video/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'consequence-video', publisher: 'Consequence', url: 'https://consequence.net/video/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'joblo-trailers', publisher: 'JoBlo', url: 'https://www.joblo.com/category/movie-trailers/feed/', kind: 'rss', videoRights: 'unconfirmed', defaultCategory: 'trailer' },
  { id: 'variety', publisher: 'Variety', url: 'https://variety.com/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'deadline', publisher: 'Deadline', url: 'https://deadline.com/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'hollywood-reporter', publisher: 'Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'billboard', publisher: 'Billboard', url: 'https://www.billboard.com/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'rolling-stone-music', publisher: 'Rolling Stone', url: 'https://www.rollingstone.com/music/music-news/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'rolling-stone-film', publisher: 'Rolling Stone', url: 'https://www.rollingstone.com/tv-movies/tv-movie-news/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'pitchfork', publisher: 'Pitchfork', url: 'https://pitchfork.com/rss/news/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'bbc-entertainment', publisher: 'BBC', url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'npr-music', publisher: 'NPR Music', url: 'https://feeds.npr.org/1039/rss.xml', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'guardian-film', publisher: 'The Guardian', url: 'https://www.theguardian.com/film/rss', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'guardian-music', publisher: 'The Guardian', url: 'https://www.theguardian.com/music/rss', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'guardian-tv', publisher: 'The Guardian', url: 'https://www.theguardian.com/tv-and-radio/rss', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'indiewire', publisher: 'IndieWire', url: 'https://www.indiewire.com/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'nme', publisher: 'NME', url: 'https://www.nme.com/feed', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'the-wrap', publisher: 'The Wrap', url: 'https://www.thewrap.com/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'consequence', publisher: 'Consequence', url: 'https://consequence.net/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'stereogum', publisher: 'Stereogum', url: 'https://www.stereogum.com/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'golden-globes', publisher: 'Golden Globes', url: 'https://goldenglobes.com/feed/', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'netflix-press', publisher: 'Netflix', url: 'https://about.netflix.com/en/feed.xml', kind: 'rss', videoRights: 'unconfirmed' },
  { id: 'moviefone-news', publisher: 'Moviefone', url: 'https://www.moviefone.com/feeds/news.json', kind: 'json-feed', videoRights: 'unconfirmed' },
  { id: 'moviefone-trailers', publisher: 'Moviefone', url: 'https://www.moviefone.com/feeds/trailers.json', kind: 'json-feed', videoRights: 'unconfirmed', defaultCategory: 'trailer' },
  { id: 'moviefone-interviews', publisher: 'Moviefone', url: 'https://www.moviefone.com/feeds/interviews.json', kind: 'json-feed', videoRights: 'unconfirmed' },
  { id: 'kinocheck', publisher: 'KinoCheck', url: 'https://api.kinocheck.com/trailers/latest?language=en&limit=25', kind: 'kinocheck', videoRights: 'unconfirmed', defaultCategory: 'trailer' },
];

/** Official channel IDs resolved and nonempty Atom feeds fetched on 20 Nov 2026. */
const VIDEO_CHANNELS = [
  ["WarnerBrosPictures", "UCjmJDM5pRKbUlVIzDYYWb6g"],
  [
    "Netflix",
    "UCWOA1ZGywLbqmigxE4Qlvuw"
  ],
  [
    "Marvel",
    "UCvC4D8onUfXzvjTOM-dBfEA"
  ],
  [
    "UniversalPictures",
    "UCq0OueAsdxH6b8nyAspwViw"
  ],
  [
    "ParamountPictures",
    "UCF9imwPMSGz4Vq1NiTWCC7g"
  ],
  [
    "SonyPictures",
    "UCz97F7dMxBNOfGYu3rx8aCw"
  ],
  [
    "A24",
    "UCuPivVjnfNo4mb3Oog_frZg"
  ],
  [
    "LionsgateMovies",
    "UCJ6nMHaJPZvsJ-HmUmj1SeA"
  ],
  [
    "SearchlightPictures",
    "UCor9rW6PgxSQ9vUPWQdnaYQ"
  ],
  [
    "FocusFeatures",
    "UCU4SM3j_9TNWaSu8KdGV50g"
  ],
  [
    "AmazonMGMStudios",
    "UCf5CjDJvsFvtVIhkfmKAwAA"
  ],
  [
    "AppleTV",
    "UC1Myj674wRVXB9I4c6Hm5zA"
  ],
  [
    "HBO",
    "UCVTQuK2CaWaTgSsoNkn5AiQ"
  ],
  [
    "Max",
    "UCQIRM93QxhQ4pGm0cxuCXDw"
  ],
  [
    "Hulu",
    "UCE5mQnNl8Q4H2qcv4ikaXeA"
  ],
  [
    "disneyplus",
    "UCIrgJInjLS2BhlHOMDW7v0g"
  ],
  [
    "Peacock",
    "UCPgMAS8woHJ_o_OZdTR7kcQ"
  ],
  [
    "NetflixAnime",
    "UCBSs9x2KzSLhyyA9IKyt4YA"
  ],
  [
    "Crunchyroll",
    "UC6pGDc4bFGD1_36IKv3FnYg"
  ],
  [
    "RottenTomatoesTRAILERS",
    "UCi8e0iOVk1fEOogdfu4YgfA"
  ],
  [
    "IGNMovieTrailers",
    "UCWJ5MfdQZ6jXbF5gYuSAf5Q"
  ],
  [
    "FilmSelectTrailer",
    "UCOlBfHN6TkmBVzZ_lkzcKwQ"
  ],
  [
    "KinoCheck",
    "UCOL10n-as9dXO2qtjjFUQbQ"
  ],
  [
    "Billboard",
    "UCsVcseUYbYjldc-XgcsiEbg"
  ],
  [
    "RollingStone",
    "UC-JblcinswY50lrUdSaRNEg"
  ],
  [
    "NPRMusic",
    "UC4eYXhJI4-7wSWc8UNRwD4A"
  ],
  [
    "COLORSxSTUDIOS",
    "UC2Qw1dzXDBAZPwS7zm37g8g"
  ],
  [
    "BBCRadio1VEVO",
    "UCKoafhJ9dkAWaEvlXCiBBwA"
  ],
  [
    "MTV",
    "UCxAICW_LdkfFYwTqTHHE0vg"
  ],
  [
    "Oscars",
    "UCb-vZWBeWA5Q2818JmmJiqQ"
  ],
  [
    "BAFTA",
    "UCtggghgcffr7-OSjiRXRM3Q"
  ],
  [
    "EntertainmentTonight",
    "UCdtXPiqI2cLorKaPrfpKc4g"
  ],
  [
    "Variety",
    "UCgRQHK8Ttr1j9xCEpCAlgbQ"
  ]
] as const;

POP_SOURCES.push(...VIDEO_CHANNELS.map(([publisher, id]): PopSource => ({
  id: `youtube-${publisher.toLowerCase()}`, publisher,
  url: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`,
  kind: 'rss', videoRights: 'unconfirmed',
  defaultCategory: ['Billboard', 'RollingStone', 'NPRMusic', 'COLORSxSTUDIOS', 'BBCRadio1VEVO', 'MTV'].includes(publisher) ? 'music'
    : ['Oscars', 'BAFTA'].includes(publisher) ? 'awards'
    : ['EntertainmentTonight', 'Variety'].includes(publisher) ? 'celebrity' : 'trailer',
})));
