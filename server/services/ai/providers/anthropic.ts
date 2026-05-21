import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, CompleteRequest, CompleteResponse } from '../aiProvider.js';
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
    const temperature = req.temperature ?? 0.7;

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

    const response = await this.client.messages.create({
      model: model.id,
      max_tokens: maxTokens,
      temperature,
      system: systemBlocks,
      messages: [{ role: 'user', content: req.userContent }],
    });

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
}
