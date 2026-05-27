import type { Tool, ToolContext } from './types.js';
import { getQuoteContext } from './getQuoteContext.js';
import { searchNews } from './searchNews.js';
import { getPortfolioRisk } from './getPortfolioRisk.js';
import { runMonteCarlo } from './runMonteCarlo.js';

const TOOLS: Tool[] = [
  getQuoteContext,
  searchNews,
  getPortfolioRisk,
  runMonteCarlo,
];

const TOOLS_BY_NAME: Record<string, Tool> = Object.fromEntries(
  TOOLS.map(t => [t.def.name, t]),
);

export function getToolDefs() {
  return TOOLS.map(t => t.def);
}

export interface ToolRunResult {
  ok: boolean;
  content: string;          // JSON-serialised payload
  truncated?: boolean;
}

const MAX_RESULT_CHARS = 8000;

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunResult> {
  const tool = TOOLS_BY_NAME[name];
  if (!tool) {
    return { ok: false, content: JSON.stringify({ error: `unknown tool: ${name}` }) };
  }
  try {
    const result = await tool.handler(input, ctx);
    let content = JSON.stringify(result);
    let truncated = false;
    if (content.length > MAX_RESULT_CHARS) {
      content = content.slice(0, MAX_RESULT_CHARS) + '… [truncated]';
      truncated = true;
    }
    return { ok: true, content, truncated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, content: JSON.stringify({ error: msg }) };
  }
}

export { TOOLS_BY_NAME };
export type { Tool, ToolContext };
