import { config } from './config.js';

export const BUFFER_API = 'https://api.buffer.com';
let bufferBlockedUntil = 0;

export class BufferRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Buffer rate limited; retry after ${retryAfterSeconds}s`);
    this.name = 'BufferRateLimitError';
  }
}

function ensureBufferAvailable(): void {
  const remainingMs = bufferBlockedUntil - Date.now();
  if (remainingMs > 0) throw new BufferRateLimitError(Math.ceil(remainingMs / 1000));
}

export async function bufferRequest(body: object): Promise<unknown> {
  if (!config.buffer.token) throw new Error('BUFFER_ACCESS_TOKEN is missing');
  ensureBufferAvailable();
  const response = await fetch(BUFFER_API, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', authorization: `Bearer ${config.buffer.token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  if (response.status === 429) {
    const retryAfterSeconds = Math.max(60, Number.parseInt(response.headers.get('retry-after') || '900', 10) || 900);
    bufferBlockedUntil = Date.now() + retryAfterSeconds * 1000;
    throw new BufferRateLimitError(retryAfterSeconds);
  }
  if (!response.ok) throw new Error(`Buffer API ${response.status} ${response.statusText}`);
  return response.json();
}

export const createPostMutation = `mutation CreatePost($text: String!, $channelId: ChannelId!) { createPost(input: { text: $text, channelId: $channelId, schedulingType: automatic, mode: addToQueue }) { ... on PostActionSuccess { post { id dueAt status } } ... on MutationError { message } } }`;
export const createVideoPostMutation = `mutation CreateVideoPost($text: String, $channelId: ChannelId!, $assets: [AssetInput!]!, $metadata: PostInputMetaData) { createPost(input: { text: $text, channelId: $channelId, schedulingType: automatic, mode: addToQueue, assets: $assets, metadata: $metadata }) { ... on PostActionSuccess { post { id dueAt status } } ... on MutationError { message } } }`;
export const getPostQuery = `query GetPost($id: PostId!) { post(input: { id: $id }) { id status dueAt sentAt error { message } } }`;

export function bufferCreatePostPayload(text: string, channelId: string) {
  return { query: createPostMutation, variables: { text, channelId } };
}

export function bufferGetPostPayload(id: string) {
  return { query: getPostQuery, variables: { id } };
}

export type BufferVideoAsset = {
  video: {
    url: string;
    metadata?: { thumbnailOffset?: number; title?: string };
  };
};

export type BufferPostMetadata = {
  tiktok?: { isAiGenerated?: boolean; title?: string };
  instagram?: { isAiGenerated?: boolean; shouldShareToFeed: boolean };
  youtube?: {
    title: string;
    categoryId: string;
    isAiGenerated?: boolean;
    madeForKids?: boolean;
    privacy?: string;
    notifySubscribers?: boolean;
  };
};

export function bufferCreateVideoPostPayload(input: {
  text: string;
  channelId: string;
  videoUrl: string;
  thumbnailOffsetMs?: number;
  metadata?: BufferPostMetadata;
}) {
  const assets: BufferVideoAsset[] = [{
    video: {
      url: input.videoUrl,
      metadata: { thumbnailOffset: input.thumbnailOffsetMs ?? 1000 },
    },
  }];
  return {
    query: createVideoPostMutation,
    variables: {
      text: input.text,
      channelId: input.channelId,
      assets,
      metadata: input.metadata ?? null,
    },
  };
}

export type BufferPostState =
  | { kind: 'published'; status: string }
  | { kind: 'queued'; status: string }
  | { kind: 'missing'; message: string }
  | { kind: 'failed'; message: string };

export function classifyBufferPostResponse(payload: unknown): BufferPostState {
  const value = payload as {
    errors?: Array<{ message?: string }>;
    data?: { post?: { status?: string; error?: { message?: string } | null } | null };
  };
  const graphError = value.errors?.map(item => item.message).filter(Boolean).join('; ');
  if (graphError) {
    if (/post not found/i.test(graphError)) return { kind: 'missing', message: graphError };
    return { kind: 'failed', message: graphError };
  }
  const post = value.data?.post;
  if (!post) return { kind: 'missing', message: 'Buffer post not found' };
  const status = String(post.status ?? '').toLowerCase();
  if (status === 'sent' || status === 'published') return { kind: 'published', status };
  if (['queued', 'scheduled', 'pending', 'draft'].includes(status)) return { kind: 'queued', status };
  const postError = post.error?.message;
  return { kind: 'failed', message: postError || `Unexpected Buffer post status: ${status || 'unknown'}` };
}

export function parseBufferCreateResponse(payload: unknown): { id: string; dueAt?: string } {
  const value = payload as {
    errors?: Array<{ message?: string }>;
    data?: { createPost?: { post?: { id: string; dueAt?: string }; message?: string } };
  };
  const error = value.errors?.map(item => item.message).filter(Boolean).join('; ') || value.data?.createPost?.message;
  const post = value.data?.createPost?.post;
  if (error || !post?.id) throw new Error(error || 'Buffer API returned no post ID');
  return post;
}
