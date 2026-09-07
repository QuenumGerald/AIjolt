export const EPISODE_STATUSES = [
  'DRAFT',
  'SCRIPT_READY',
  'GENERATING',
  'ASSEMBLING',
  'REVIEW_READY',
  'APPROVED',
  'FAILED',
  'CANCELLED',
] as const;

export type EpisodeStatus = typeof EPISODE_STATUSES[number];

export type StoryDestination = 'tiktok' | 'instagram' | 'youtube';

export type PublicationStatus = 'blocked' | 'pending' | 'queued' | 'published' | 'failed';

export type AssetKind =
  | 'note'
  | 'script'
  | 'character_ref'
  | 'narration'
  | 'video_segment'
  | 'subtitle'
  | 'mp4'
  | 'thumbnail';

export type TaskStep = 'script' | 'tts' | 'video' | 'assemble' | 'host' | 'publish';

export type TaskStatus = 'pending' | 'submitted' | 'polling' | 'succeeded' | 'failed' | 'skipped';

export type CostKind = 'estimated' | 'confirmed' | 'unknown';

export interface SceneScript {
  index: number;
  durationSeconds: number;
  narration: string;
  visualPrompt: string;
  location: string;
  outfit: string;
  continuityNotes: string;
}

export interface EpisodeScript {
  title: string;
  logline: string;
  narration: string;
  language: 'fr';
  scenes: SceneScript[];
}

export interface CharacterStyle {
  name: string;
  description: string;
  outfit: string;
  style: string;
  referenceImageUrls: string[];
  referenceVideoUrls: string[];
  avatarAssetIds: string[];
  missing: string[];
}

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
  alignment: 'tts-timestamps' | 'duration-proportional';
}

export interface Episode {
  id: number;
  title: string | null;
  note: string;
  durationSeconds: number;
  status: EpisodeStatus;
  script: EpisodeScript | null;
  scriptHash: string | null;
  error: string | null;
  approvedAssetId: number | null;
  outputMp4AssetId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeAsset {
  id: number;
  episodeId: number;
  kind: AssetKind;
  status: 'valid' | 'invalid';
  path: string | null;
  publicUrl: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  mime: string | null;
  metadata: Record<string, unknown>;
  checksum: string | null;
  createdAt: string;
}

export interface EpisodeTask {
  id: number;
  episodeId: number;
  step: TaskStep;
  segmentIndex: number;
  status: TaskStatus;
  attempts: number;
  provider: string | null;
  providerRequestId: string | null;
  error: string | null;
  inputHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodePublication {
  id: number;
  episodeId: number;
  destination: StoryDestination;
  status: PublicationStatus;
  providerId: string | null;
  scheduledAt: string | null;
  error: string | null;
  caption: string | null;
  mediaUrl: string | null;
  assetId: number | null;
  createdAt: string;
  updatedAt: string;
}
