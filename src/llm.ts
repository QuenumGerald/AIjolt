import { config } from './config.js';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LlmUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LlmResult = {
  text: string;
  model: string;
  usage: LlmUsage;
};

export type LlmClient = {
  complete(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LlmResult>;
};

export class DryRunLlmError extends Error {
  constructor() {
    super('LLM call blocked: DRY_RUN=true');
    this.name = 'DryRunLlmError';
  }
}

export function createDeepSeekClient(options: { dryRun?: boolean; fetchImpl?: typeof fetch } = {}): LlmClient {
  const dryRun = options.dryRun ?? config.dryRun;
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async complete(messages, completeOptions = {}) {
      if (dryRun) throw new DryRunLlmError();
      if (!config.deepseek.apiKey) throw new Error('DEEPSEEK_API_KEY is required for script generation');
      const response = await fetchImpl(`${config.deepseek.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.deepseek.apiKey}` },
        body: JSON.stringify({
          model: config.deepseek.model,
          temperature: completeOptions.temperature ?? 0.7,
          max_tokens: completeOptions.maxTokens ?? 8192,
          messages,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`DeepSeek API ${response.status} ${response.statusText}`);
      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const text = payload.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('DeepSeek returned no script content');
      return {
        text,
        model: config.deepseek.model,
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
          totalTokens: payload.usage?.total_tokens,
        },
      };
    },
  };
}

export function estimateLlmUsd(usage: LlmUsage): { costKind: 'estimated' | 'unknown'; usd: number | null } {
  const inputRate = config.deepseek.usdPer1kInputTokens;
  const outputRate = config.deepseek.usdPer1kOutputTokens;
  if (inputRate == null || outputRate == null || usage.promptTokens == null || usage.completionTokens == null) {
    return { costKind: 'unknown', usd: null };
  }
  return {
    costKind: 'estimated',
    usd: (usage.promptTokens / 1000) * inputRate + (usage.completionTokens / 1000) * outputRate,
  };
}
