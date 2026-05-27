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

// ── Tool use (IE-3) ──
// Multi-turn conversational interface with tool calling. Keeping it separate
// from `complete` so the simple single-shot path stays narrow.

export interface ChatToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;   // JSON schema (Anthropic format)
}

// One assistant turn after a tool was invoked: text block(s) + tool_use block(s),
// or just text when the model is done.
export interface ChatToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ChatToolResult {
  toolUseId: string;
  content: string;   // tool result serialized as string (JSON or text)
  isError?: boolean;
}

// Message in the conversation, in the order Claude expects.
export type ChatMessage =
  | { role: 'user';      content: string }
  | { role: 'user';      content: { type: 'tool_result'; toolResults: ChatToolResult[] } }
  | { role: 'assistant'; content: { type: 'mixed'; text: string; toolUses: ChatToolUse[] } };

export interface ChatRequest {
  model: ModelTier;
  system: string;
  messages: ChatMessage[];
  tools?: ChatToolDef[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  text: string;                        // concatenated text blocks
  toolUses: ChatToolUse[];             // empty if stop_reason !== 'tool_use'
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence' | string;
  tokens: TokenCounts;
  modelId: string;
  tier: ModelTier;
}

export interface AIProvider {
  name: string;
  complete(req: CompleteRequest): Promise<CompleteResponse>;
  chat(req: ChatRequest): Promise<ChatResponse>;
}
