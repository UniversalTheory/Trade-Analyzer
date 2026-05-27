import crypto from 'node:crypto';
import type {
  CompleteRequest,
  CompleteResponse,
  ChatMessage,
  ChatToolUse,
} from './aiProvider.js';
import { AnthropicProvider } from './providers/anthropic.js';
import type { ModelTier, TokenCounts } from './pricing.js';
import { cache } from '../cache.js';
import {
  precheck,
  recordCall,
  getTaskModelOverride,
  getGlobalModelOverride,
  _setTaskDefaultsProvider,
  type UsageSnapshot,
} from './usageTracker.js';
import { getToolDefs, runTool, type ToolContext } from './tools/index.js';

// Built-in per-task default model. User settings (taskModels / globalModelOverride
// in .ai-usage.json) layer on top — see resolveTier below.
export const TASK_DEFAULT_MODEL: Record<string, ModelTier> = {
  briefing: 'sonnet',
  recSummary: 'haiku',
  portfolioSuggestions: 'sonnet',
  chat: 'sonnet',
  analyze: 'sonnet',
};

// Let the usage tracker include the read-only defaults map in its snapshot
// without a circular import.
_setTaskDefaultsProvider(() => ({ ...TASK_DEFAULT_MODEL }));

// Resolve the model tier for a dispatch call. Priority (highest first):
//   1. explicit req.model (programmatic caller override, e.g. chat "deep dive")
//   2. global override set in widget ("force all tasks to X")
//   3. per-task override set in widget
//   4. built-in TASK_DEFAULT_MODEL[task]
//   5. fallback 'sonnet'
function resolveTier(task: string, explicit: ModelTier | undefined): ModelTier {
  if (explicit) return explicit;
  const globalOverride = getGlobalModelOverride();
  if (globalOverride) return globalOverride;
  const taskOverride = getTaskModelOverride(task);
  if (taskOverride) return taskOverride;
  return TASK_DEFAULT_MODEL[task] ?? 'sonnet';
}

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

  const tier: ModelTier = resolveTier(req.task, req.model);
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

// ── Chat (IE-3): multi-turn with tool use ──

export interface ChatDispatchMessage {
  role: 'user' | 'assistant';
  content: string;        // user-visible text; assistant content for prior turns is stored as text
}

export interface ChatToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  resultPreview: string;  // first ~200 chars of result, for transcript display
  isError: boolean;
}

export interface ChatDispatchRequest {
  // Prior conversation, ending with the latest user message. We DO NOT replay
  // prior tool calls (their results are baked into the assistant text already);
  // each new user turn starts a fresh tool-use loop.
  messages: ChatDispatchMessage[];
  system: string;
  toolContext: ToolContext;
  model?: ModelTier;
  maxTokens?: number;
  maxToolIterations?: number;  // default 6
}

export interface ChatDispatchResponse {
  text: string;
  toolCalls: ChatToolCallRecord[];
  costUsd: number;
  modelTier: ModelTier;
  modelId: string;
  usage: UsageSnapshot;
  stopReason: string;
  iterations: number;
}

const DEFAULT_MAX_TOOL_ITERATIONS = 6;

function addTokens(a: TokenCounts, b: TokenCounts): TokenCounts {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export async function dispatchChat(req: ChatDispatchRequest): Promise<ChatDispatchResponse> {
  if (!isAiConfigured()) {
    throw new Error('AI not configured');
  }
  const task = 'chat';
  const pre = precheck(task);
  if (!pre.allowed) {
    const err = new Error(pre.reason ?? 'ai_blocked');
    (err as Error & { code?: string; snapshot?: UsageSnapshot }).code = pre.reason;
    (err as Error & { snapshot?: UsageSnapshot }).snapshot = pre.snapshot;
    throw err;
  }

  const tier: ModelTier = resolveTier(task, req.model);
  const provider = getAnthropic();
  const tools = getToolDefs();
  const maxIter = req.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;
  const maxTokens = req.maxTokens ?? 1500;

  // Seed the messages list from the client's prior conversation. Each prior
  // assistant turn is sent as a single text block; we don't re-replay tool_use
  // blocks (the model already produced text reflecting their results).
  const messages: ChatMessage[] = req.messages.map((m): ChatMessage => {
    if (m.role === 'user') return { role: 'user', content: m.content };
    return { role: 'assistant', content: { type: 'mixed', text: m.content, toolUses: [] } };
  });

  let totalTokens: TokenCounts = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const toolCalls: ChatToolCallRecord[] = [];
  let lastText = '';
  let lastStopReason = 'end_turn';
  let modelId = '';
  let iterations = 0;

  for (let i = 0; i < maxIter; i++) {
    iterations++;
    const resp = await provider.chat({
      model: tier,
      system: req.system,
      messages,
      tools,
      maxTokens,
    });
    totalTokens = addTokens(totalTokens, resp.tokens);
    lastText = resp.text;
    lastStopReason = resp.stopReason;
    modelId = resp.modelId;

    if (resp.stopReason !== 'tool_use' || resp.toolUses.length === 0) {
      break;
    }

    // Append the assistant turn (text + tool_use blocks), then run the tools
    // and feed results back as a single user turn.
    messages.push({
      role: 'assistant',
      content: { type: 'mixed', text: resp.text, toolUses: resp.toolUses },
    });

    const toolResults = await Promise.all(resp.toolUses.map(async (tu: ChatToolUse) => {
      const out = await runTool(tu.name, tu.input, req.toolContext);
      toolCalls.push({
        name: tu.name,
        input: tu.input,
        resultPreview: out.content.slice(0, 200),
        isError: !out.ok,
      });
      return {
        toolUseId: tu.id,
        content: out.content,
        isError: !out.ok ? true : undefined,
      };
    }));

    messages.push({
      role: 'user',
      content: { type: 'tool_result', toolResults },
    });
  }

  const { costUsd, snapshot } = recordCall({
    task,
    model: tier,
    tokens: totalTokens,
    cached: false,
  });

  return {
    text: lastText,
    toolCalls,
    costUsd,
    modelTier: tier,
    modelId,
    usage: snapshot,
    stopReason: lastStopReason,
    iterations,
  };
}
