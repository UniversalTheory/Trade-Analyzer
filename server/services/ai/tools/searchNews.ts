import { getProvider, cachedCall, TTLCache } from '../../providerRegistry.js';
import type { Tool } from './types.js';

const MAX_ITEMS = 8;

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.floor(diff / 60_000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const searchNews: Tool = {
  def: {
    name: 'searchNews',
    description:
      'Fetch recent news headlines. Pass a ticker symbol to get ticker-specific news (e.g. "NVDA"), ' +
      'or omit `symbol` for general market headlines. Returns up to 8 items: headline, summary, source, ' +
      'time-ago string, and optional sentiment (positive/negative/neutral) from our lexicon. Use this ' +
      'when the user asks "what\'s driving X" or "any news on Y" — saves you from guessing about catalysts.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description:
            'Optional ticker symbol. Omit for general market news.',
        },
      },
      required: [],
    },
  },
  async handler(input) {
    const symbol = typeof input.symbol === 'string' ? input.symbol.trim().toUpperCase() : '';
    const provider = getProvider('news');

    const items = symbol
      ? await cachedCall(
          `ticker:news:${symbol}`,
          TTLCache.TTL.NEWS,
          () => provider.getNews(symbol),
        )
      : await cachedCall(
          `market:news`,
          TTLCache.TTL.NEWS,
          () => provider.getNews(),
        );

    const top = items.slice(0, MAX_ITEMS).map(it => ({
      headline: it.headline,
      summary: it.summary?.slice(0, 280) ?? '',
      source: it.source,
      time: timeAgo(it.datetime),
      sentiment: it.sentiment,
      url: it.url,
    }));

    return {
      symbol: symbol || null,
      items: top,
      truncated: items.length > MAX_ITEMS,
      totalAvailable: items.length,
    };
  },
};
