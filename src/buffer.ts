export const createPostMutation = `mutation CreatePost($text: String!, $channelId: ChannelId!, $dueAt: DateTime!) { createPost(input: { text: $text, channelId: $channelId, schedulingType: automatic, mode: customScheduled, dueAt: $dueAt }) { ... on PostActionSuccess { post { id dueAt status } } ... on MutationError { message } } }`;
export const getPostQuery = `query GetPost($id: PostId!) { post(input: { id: $id }) { id status dueAt sentAt error { message } } }`;
export const deletePostMutation = `mutation DeletePost($id: PostId!) { deletePost(input: { id: $id }) { ... on DeletePostSuccess { id } ... on VoidMutationError { message } ... on MutationError { message } } }`;

export function bufferCreatePostPayload(text: string, channelId: string, dueAt: string) {
  return { query: createPostMutation, variables: { text, channelId, dueAt } };
}

export function bufferGetPostPayload(id: string) {
  return { query: getPostQuery, variables: { id } };
}

export function bufferDeletePostPayload(id: string) {
  return { query: deletePostMutation, variables: { id } };
}

export type BufferListedPost = {
  id: string;
  text?: string | null;
  status?: string | null;
  createdAt?: string | null;
  dueAt?: string | null;
  channelId?: string | null;
};

/** Liste les posts d’un canal (sent / scheduled) pour backfill SEO sans Foorilla. */
export function bufferListChannelPostsPayload(input: {
  organizationId: string;
  channelIds: string[];
  status: 'sent' | 'scheduled';
  first?: number;
  after?: string;
}) {
  const query = `query ListChannelPosts($first: Int!, $after: String, $organizationId: ID!, $channelIds: [ChannelId!]!, $status: [PostStatus!]!) {
    posts(first: $first, after: $after, input: {
      organizationId: $organizationId,
      sort: [{ field: dueAt, direction: desc }, { field: createdAt, direction: desc }],
      filter: { status: $status, channelIds: $channelIds }
    }) {
      edges { node { id text status createdAt dueAt channelId } }
      pageInfo { hasNextPage endCursor }
    }
  }`;
  return {
    query,
    variables: {
      first: input.first ?? 50,
      after: input.after ?? null,
      organizationId: input.organizationId,
      channelIds: input.channelIds,
      status: [input.status],
    },
  };
}

/** URLs de candidature présentes dans un post Buffer (Apply: …). */
export function extractApplyUrls(text: string): string[] {
  const urls = [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)].map((match) =>
    match[0].replace(/[.,;:]+$/g, ''),
  );
  return [...new Set(urls)];
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
