import { mkdirSync } from 'node:fs';
import { writeFile, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { config } from '../config.js';

export type GmiStatus = 'queued' | 'dispatched' | 'processing' | 'success' | 'failed' | 'cancelled' | string;

export type GmiRequest = {
  request_id: string;
  model: string;
  status: GmiStatus;
  payload?: Record<string, unknown>;
  outcome?: Record<string, unknown> | null;
  error?: { message?: string } | string | null;
};

export type GmiClient = {
  submit(model: string, payload: Record<string, unknown>): Promise<GmiRequest>;
  get(requestId: string): Promise<GmiRequest>;
  wait(requestId: string, options?: { intervalMs?: number; timeoutMs?: number }): Promise<GmiRequest>;
  upload(localPath: string, fileType: 'mp4' | 'mp3' | 'wav' | 'png' | 'jpg' | 'jpeg'): Promise<{ publicUrl: string }>;
  download(url: string, destPath: string): Promise<void>;
};

export class DryRunGmiError extends Error {
  constructor(action: string) {
    super(`GMI ${action} blocked: DRY_RUN=true`);
    this.name = 'DryRunGmiError';
  }
}

const ACTIVE = new Set(['queued', 'dispatched', 'processing']);

export function gmiHeaders(): Record<string, string> {
  if (!config.gmi.apiKey) throw new Error('GMI_API_KEY is missing');
  const headers: Record<string, string> = {
    accept: 'application/json',
    authorization: `Bearer ${config.gmi.apiKey}`,
  };
  if (config.gmi.orgId) headers['X-Organization-ID'] = config.gmi.orgId;
  return headers;
}

export function extractMediaUrl(request: GmiRequest): string | undefined {
  const outcome = request.outcome ?? {};
  if (typeof outcome.video_url === 'string' && outcome.video_url) return outcome.video_url;
  const media = outcome.media_urls;
  if (Array.isArray(media) && typeof media[0]?.url === 'string') return media[0].url;
  if (typeof outcome.audio_url === 'string' && outcome.audio_url) return outcome.audio_url;
  if (typeof outcome.url === 'string' && outcome.url) return outcome.url;
  return undefined;
}

export function extractTtsTimestamps(request: GmiRequest): unknown {
  const outcome = request.outcome ?? {};
  return outcome.timestamps ?? outcome.word_timestamps ?? outcome.subtitle ?? outcome.alignment ?? null;
}

export function createGmiClient(options: { dryRun?: boolean; fetchImpl?: typeof fetch } = {}): GmiClient {
  const dryRun = options.dryRun ?? config.dryRun;
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = `${config.gmi.baseUrl}/api/v1/ie/requestqueue/apikey`;

  async function requestJson(url: string, init: RequestInit): Promise<any> {
    const response = await fetchImpl(url, {
      ...init,
      headers: { ...gmiHeaders(), ...(init.headers as Record<string, string> | undefined), ...(init.body ? { 'content-type': 'application/json' } : {}) },
      signal: init.signal ?? AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`GMI API ${response.status} ${response.statusText}`);
    return response.json();
  }

  return {
    async submit(model, payload) {
      if (dryRun) throw new DryRunGmiError('submit');
      return requestJson(`${base}/requests`, { method: 'POST', body: JSON.stringify({ model, payload }) }) as Promise<GmiRequest>;
    },
    async get(requestId) {
      if (dryRun) throw new DryRunGmiError('get');
      return requestJson(`${base}/requests/${encodeURIComponent(requestId)}`, { method: 'GET' }) as Promise<GmiRequest>;
    },
    async wait(requestId, waitOptions = {}) {
      const intervalMs = waitOptions.intervalMs ?? config.gmi.pollIntervalMs;
      const timeoutMs = waitOptions.timeoutMs ?? config.gmi.pollTimeoutMs;
      const started = Date.now();
      let last: GmiRequest | undefined;
      while (Date.now() - started < timeoutMs) {
        last = await this.get(requestId);
        if (!ACTIVE.has(String(last.status))) return last;
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
      if (last) return last;
      throw new Error(`GMI request ${requestId} timed out before a status was returned`);
    },
    async upload(localPath, fileType) {
      if (dryRun) throw new DryRunGmiError('upload');
      const ticket = await requestJson(`${base}/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ file_type: fileType }),
      }) as { upload_url?: string; public_url?: string };
      if (!ticket.upload_url || !ticket.public_url) throw new Error('GMI upload-url did not return upload_url and public_url');
      const body = await readFile(localPath);
      const contentType = fileType === 'mp4' ? 'video/mp4'
        : fileType === 'mp3' ? 'audio/mpeg'
          : fileType === 'wav' ? 'audio/wav'
            : fileType === 'png' ? 'image/png'
              : 'image/jpeg';
      const put = await fetchImpl(ticket.upload_url, {
        method: 'PUT',
        headers: { 'content-type': contentType },
        body,
        signal: AbortSignal.timeout(120_000),
      });
      if (!put.ok) throw new Error(`GMI file upload failed: ${put.status} ${put.statusText}`);
      return { publicUrl: ticket.public_url };
    },
    async download(url, destPath) {
      if (dryRun) throw new DryRunGmiError('download');
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(180_000) });
      if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      mkdirSync(dirname(destPath), { recursive: true });
      await writeFile(destPath, bytes);
    },
  };
}

export function isActiveGmiStatus(status: string): boolean {
  return ACTIVE.has(status);
}
