export type Category = 'film' | 'series' | 'music' | 'celebrity' | 'awards' | 'trailer' | 'news' | 'animals' | 'science' | 'sport' | 'weather' | 'viral';

export type VideoKind = 'none' | 'direct-file' | 'hls-playlist' | 'youtube-page' | 'web-page';

export type VideoRights = 'confirmed' | 'unconfirmed' | 'excluded';

export type ItemStatus = 'ready' | 'rejected' | 'attempted' | 'queued' | 'published' | 'failed';

export type VideoAssessment = {
  kind: VideoKind;
  url: string | null;
  mime: string | null;
  bytes: number | null;
  durationSeconds: number | null;
  rights: VideoRights;
  stable: boolean;
  attach: boolean;
  rejection: string;
};

export type DraftItem = {
  source: string;
  externalId: string;
  url: string;
  title: string;
  summary: string;
  publisher: string;
  category: Category;
  publishedAt: string;
  score: number;
  status: 'ready' | 'rejected';
  rejection: string | null;
  postText: string | null;
  video: VideoAssessment;
};

export type SourceKind = 'rss' | 'json-feed' | 'kinocheck' | 'nbc-video' | 'tmz-video' | 'et-video' | 'euronews-video';

export type PopSource = {
  id: string;
  publisher: string;
  url: string;
  kind: SourceKind;
  /** Rights for rehosting a video file from this source onto X. */
  videoRights: VideoRights;
  defaultCategory?: Category;
};
