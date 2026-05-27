import Anthropic from '@anthropic-ai/sdk';
import type {
  AIProvider,
  CompleteRequest,
  CompleteResponse,
  ChatRequest,
  ChatResponse,
  ChatMessage,
  ChatToolUse,
} from '../aiProvider.js';
import { MODELS } from '../pricing.js';

// Minimum chars before we attach cache_control. Anthropic silently no-ops
// cache writes below the model's minimum: Sonnet/Opus require ~1024 tokens,
// Haiku ~2048. Using ~9000 chars (~2250 tokens at 4 chars/token) keeps us
// safely above the Haiku floor for all tiers.
const CACHE_MIN_CHARS = 9000;

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const model = MODELS[req.model];
    const maxTokens = req.maxTokens ?? 1024;

    const systemBlocks: Anthropic.TextBlockParam[] = [
      { type: 'text', text: req.system },
    ];
    if (req.cacheableContext && req.cacheableContext.length >= CACHE_MIN_CHARS) {
      systemBlocks.push({
        type: 'text',
        text: req.cacheableContext,
        cache_control: { type: 'ephemeral' },
      });
    } else if (req.cacheableContext) {
      systemBlocks.push({ type: 'text', text: req.cacheableContext });
    }

    // Opus 4.x no longer accepts user-set `temperature` (rejects with
    // "temperature is deprecated for this model"). Only send it on Haiku/Sonnet.
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: model.id,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages: [{ role: 'user', content: req.userContent }],
    };
    if (req.model !== 'opus') {
      params.temperature = req.temperature ?? 0.7;
    }

    const response = await this.client.messages.create(params);

    if (process.env.AI_DEBUG === '1') {
      console.log('[anthropic] tier=%s usage=%o', req.model, response.usage);
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    const usage = response.usage;
    return {
      text,
      tokens: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      },
      modelId: response.model,
      tier: req.model,
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const model = MODELS[req.model];
    const maxTokens = req.maxTokens ?? 1024;

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: model.id,
      max_tokens: maxTokens,
      system: req.system,
      messages: req.messages.map(toAnthropicMessage),
    };
    if (req.tools && req.tools.length > 0) {
      params.tools = req.tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema as Anthropic.Tool.InputSchema,
      }));
    }
    if (req.model !== 'opus') {
      params.temperature = req.temperature ?? 0.7;
    }

    const response = await this.client.messages.create(params);

    if (process.env.AI_DEBUG === '1') {
      console.log('[anthropic chat] tier=%s stop=%s usage=%o', req.model, response.stop_reason, response.usage);
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('');

    const toolUses: ChatToolUse[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map(b => ({
        id: b.id,
        name: b.name,
        input: (b.input as Record<string, unknown>) ?? {},
      }));

    const usage = response.usage;
    return {
      text,
      toolUses,
      stopReason: response.stop_reason ?? 'end_turn',
      tokens: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      },
      modelId: response.model,
      tier: req.model,
    };
  }
}

function toAnthropicMessage(m: ChatMessage): Anthropic.MessageParam {
  if (m.role === 'user') {
    if (typeof m.content === 'string') {
      return { role: 'user', content: m.content };
    }
    // tool_result wrapper
    return {
      role: 'user',
      content: m.content.toolResults.map(tr => ({
        type: 'tool_result' as const,
        tool_use_id: tr.toolUseId,
        content: tr.content,
        is_error: tr.isError === true ? true : undefined,
      })),
    };
  }
  // assistant: mixed text + tool_use
  const blocks: Array<Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam> = [];
  if (m.content.text) {
    blocks.push({ type: 'text', text: m.content.text });
  }
  for (const tu of m.content.toolUses) {
    blocks.push({
      type: 'tool_use',
      id: tu.id,
      name: tu.name,
      input: tu.input,
    });
  }
  return { role: 'assistant', content: blocks };
}

// Re-export the CACHE_MIN_CHARS constant for future caller-side awareness.
export { CACHE_MIN_CHARS };
