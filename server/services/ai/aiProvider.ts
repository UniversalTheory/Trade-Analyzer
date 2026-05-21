// Common interface every AI provider implements. Keep this surface small —
// the cost of adding a new provider should be one file in ./providers/.

import type { ModelTier, TokenCounts } from './pricing.js';

export interface CompleteRequest {
  model: ModelTier;
  system: string;                  // short, non-cached system prompt
  userContent: string;             // the user message body
  cacheableContext?: string;       // long stable context — providers with native prompt caching attach cache_control here
  maxTokens?: number;              // default 1024
  temperature?: number;            // default 0.7
}

export interface CompleteResponse {
  text: string;
  tokens: TokenCounts;
  modelId: string;                 // exact model ID actually called
  tier: ModelTier;
}

export interface AIProvider {
  name: string;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
}
