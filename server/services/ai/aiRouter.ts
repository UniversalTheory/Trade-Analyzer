import crypto from 'node:crypto';
import type { CompleteRequest, CompleteResponse } from './aiProvider.js';
import { AnthropicProvider } from './providers/anthropic.js';
import type { ModelTier } from './pricing.js';
import { cache } from '../cache.js';
import { precheck, recordCall, type UsageSnapshot } from './usageTracker.js';

// Per-task default model. UI/settings can override per-call.
export const TASK_DEFAULT_MODEL: Record<string, ModelTier> = {
  briefing: 'sonnet',
  recSummary: 'haiku',
  portfolioSuggestions: 'sonnet',
  chat: 'sonnet',
  analyze: 'sonnet',
};

// Per-task TTLCache wrap (skips the provider entirely when content hash matches).
const TASK_CACHE_TTL_MS: Record<string, number> = {
  briefing: 10 * 60 * 1000,
  recSummary: 15 * 60 * 1000,
  portfolioSuggestions: 30 * 60 * 1000,
  chat: 0,                          // chat is conversational, no content-hash cache
  analyze: 5 * 60 * 1000,
};

let anthropicProvider: AnthropicProvider | null = null;

function getAnthropic(): AnthropicProvider {
  if (anthropicProvider) return anthropicProvider;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }
  anthropicProvider = new AnthropicProvider(key);
  return anthropicProvider;
}

export function isAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function hashRequest(model: ModelTier, req: Pick<CompleteRequest, 'system' | 'userContent' | 'cacheableContext'>): string {
  const h = crypto.createHash('sha256');
  h.update(model);
  h.update('|');
  h.update(req.system);
  h.update('|');
  h.update(req.userContent);
  h.update('|');
  h.update(req.cacheableContext ?? '');
  return h.digest('hex').slice(0, 24);
}

export interface DispatchRequest extends Omit<CompleteRequest, 'model'> {
  task: string;
  model?: ModelTier;          // overrides TASK_DEFAULT_MODEL[task]
  cacheKey?: string;          // optional override; defaults to content hash
  cacheTtlMs?: number;        // optional override on the TTLCache wrap
  bypassCache?: boolean;      // force a fresh provider call
}

export interface DispatchResponse {
  text: string;
  fromCache: boolean;
  costUsd: number;
  modelTier: ModelTier;
  modelId: string;
  usage: UsageSnapshot;
}

interface CachedEntry {
  text: string;
  modelTier: ModelTier;
  modelId: string;
  cachedAt: number;
}

export async function dispatch(req: DispatchRequest): Promise<DispatchResponse> {
  if (!isAiConfigured()) {
    throw new Error('AI not configured');
  }

  const pre = precheck(req.task);
  if (!pre.allowed) {
    const err = new Error(pre.reason ?? 'ai_blocked');
    (err as Error & { code?: string; snapshot?: UsageSnapshot }).code = pre.reason;
    (err as Error & { snapshot?: UsageSnapshot }).snapshot = pre.snapshot;
    throw err;
  }

  const tier: ModelTier = req.model ?? TASK_DEFAULT_MODEL[req.task] ?? 'sonnet';
  const ttl = req.cacheTtlMs ?? TASK_CACHE_TTL_MS[req.task] ?? 0;
  const cacheKey = ttl > 0
    ? `ai:${req.task}:${req.cacheKey ?? hashRequest(tier, req)}`
    : null;

  if (cacheKey && !req.bypassCache) {
    const hit = cache.get<CachedEntry>(cacheKey);
    if (hit) {
      // Cache hits are zero-cost: no provider call, no token spend. We still
      // log it so the recentCalls feed shows the cached hit for visibility.
      const { snapshot } = recordCall({
        task: req.task,
        model: tier,
        tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        cached: true,
      });
      return {
        text: hit.text,
        fromCache: true,
        costUsd: 0,
        modelTier: hit.modelTier,
        modelId: hit.modelId,
        usage: snapshot,
      };
    }
  }

  const provider = getAnthropic();
  const response: CompleteResponse = await provider.complete({
    model: tier,
    system: req.system,
    userContent: req.userContent,
    cacheableContext: req.cacheableContext,
    maxTokens: req.maxTokens,
    temperature: req.temperature,
  });

  const { costUsd, snapshot } = recordCall({
    task: req.task,
    model: tier,
    tokens: response.tokens,
    cached: false,
  });

  if (cacheKey) {
    cache.set<CachedEntry>(cacheKey, {
      text: response.text,
      modelTier: response.tier,
      modelId: response.modelId,
      cachedAt: Date.now(),
    }, ttl);
  }

  return {
    text: response.text,
    fromCache: false,
    costUsd,
    modelTier: response.tier,
    modelId: response.modelId,
    usage: snapshot,
  };
}
