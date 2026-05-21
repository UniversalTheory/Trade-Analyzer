// Per-model pricing in USD per million tokens.
// Update these when Anthropic publishes new rates; everything else stays the same.

export type ModelTier = 'haiku' | 'sonnet' | 'opus';

export interface ModelPricing {
  id: string;              // exact model ID for the Anthropic SDK
  tier: ModelTier;
  inputPerMTok: number;    // $ per 1M input tokens (uncached)
  outputPerMTok: number;   // $ per 1M output tokens
  cacheReadMult: number;   // multiplier on inputPerMTok for cached reads
  cacheWriteMult: number;  // multiplier on inputPerMTok for cache writes (5-min ephemeral)
}

export const MODELS: Record<ModelTier, ModelPricing> = {
  haiku: {
    id: 'claude-haiku-4-5-20251001',
    tier: 'haiku',
    inputPerMTok: 1.0,
    outputPerMTok: 5.0,
    cacheReadMult: 0.1,
    cacheWriteMult: 1.25,
  },
  sonnet: {
    id: 'claude-sonnet-4-6',
    tier: 'sonnet',
    inputPerMTok: 3.0,
    outputPerMTok: 15.0,
    cacheReadMult: 0.1,
    cacheWriteMult: 1.25,
  },
  opus: {
    id: 'claude-opus-4-7',
    tier: 'opus',
    inputPerMTok: 15.0,
    outputPerMTok: 75.0,
    cacheReadMult: 0.1,
    cacheWriteMult: 1.25,
  },
};

// Anthropic returns input_tokens, cache_creation_input_tokens, cache_read_input_tokens
// as additive buckets — not overlapping. Match that shape here.
export interface TokenCounts {
  inputTokens: number;       // uncached input only
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function computeCostUsd(tier: ModelTier, t: TokenCounts): number {
  const m = MODELS[tier];
  return (
    (t.inputTokens * m.inputPerMTok) / 1_000_000 +
    (t.cacheReadTokens * m.inputPerMTok * m.cacheReadMult) / 1_000_000 +
    (t.cacheWriteTokens * m.inputPerMTok * m.cacheWriteMult) / 1_000_000 +
    (t.outputTokens * m.outputPerMTok) / 1_000_000
  );
}
