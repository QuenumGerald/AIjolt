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
