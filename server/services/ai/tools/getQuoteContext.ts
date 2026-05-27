import YahooFinance from 'yahoo-finance2';
import { getProvider, cachedCall, TTLCache } from '../../providerRegistry.js';
import type { Tool } from './types.js';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const getQuoteContext: Tool = {
  def: {
    name: 'getQuoteContext',
    description:
      'Get a live quote plus basic profile for a stock or ETF symbol. ' +
      'Returns price, daily change, volume vs average volume, 52-week range, market cap, P/E if available, ' +
      'sector/industry, and a short description. Use this whenever the user mentions a ticker and you want ' +
      'concrete current numbers rather than guessing. Cheap and fast — call freely.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Ticker symbol, e.g. NVDA, SPY, BTC-USD. Will be upper-cased.',
        },
      },
      required: ['symbol'],
    },
  },
  async handler(input) {
    const raw = String(input.symbol ?? '').trim().toUpperCase();
    if (!raw) return { error: 'symbol is required' };

    const provider = getProvider('quote');
    const quote = await cachedCall(
      `ticker:quote:${raw}`,
      TTLCache.TTL.QUOTE,
      () => provider.getQuote(raw),
    );

    let sector: string | undefined;
    let industry: string | undefined;
    let description: string | undefined;
    try {
      const summary = await cachedCall(
        `ticker:profile:${raw}`,
        TTLCache.TTL.SEARCH,
        () =>
          yf.quoteSummary(raw, {
            modules: ['assetProfile', 'summaryProfile', 'fundProfile'] as never,
          }),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = summary as any;
      const asset = s.assetProfile ?? s.summaryProfile;
      sector = asset?.sector;
      industry = asset?.industry;
      const longDesc =
        asset?.longBusinessSummary ?? s.fundProfile?.longBusinessSummary ?? '';
      description = typeof longDesc === 'string' && longDesc.length > 0
        ? longDesc.slice(0, 500)
        : undefined;
    } catch {
      // profile is best-effort; quote alone is still useful
    }

    return {
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      previousClose: quote.previousClose,
      volume: quote.volume,
      avgVolume: quote.avgVolume,
      volumeVsAvg:
        quote.avgVolume && quote.avgVolume > 0
          ? Number((quote.volume / quote.avgVolume).toFixed(2))
          : null,
      marketCap: quote.marketCap,
      pe: quote.pe,
      week52High: quote.week52High,
      week52Low: quote.week52Low,
      sector,
      industry,
      description,
    };
  },
};
