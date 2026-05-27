// Shared tool types for the IE-3 chat tool-use loop.
// Each tool: an Anthropic-format definition + a server-side handler.

import type { ChatToolDef } from '../aiProvider.js';

// Lightweight portfolio snapshot shipped from the client. The browser owns the
// portfolio (localStorage); chat doesn't query a server-side store, it passes a
// digest along with each request so portfolio-aware tools can answer.
export interface ChatPortfolioSnapshot {
  positions: Array<{
    symbol: string;
    shares: number;
    avgPrice: number;
    addedAt?: string;
  }>;
  cash: number;
}

// View-context passed by the client so Claude knows what the user is looking at.
export interface ChatViewContext {
  activeTab?: string;             // 'briefing' | 'home' | 'ticker' | ...
  activeTicker?: string;          // current symbol on Research tab, if any
  hasPortfolio?: boolean;         // does the user have positions?
}

// What every tool handler receives.
export interface ToolContext {
  portfolio?: ChatPortfolioSnapshot;
  view?: ChatViewContext;
}

// Result of running a tool: serialised to a string for tool_result.content.
export type ToolHandler = (
  input: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>;

export interface Tool {
  def: ChatToolDef;
  handler: ToolHandler;
}
