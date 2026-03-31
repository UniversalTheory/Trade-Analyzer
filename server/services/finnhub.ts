import type {
  MarketDataProvider,
  QuoteData,
  NewsItem,
  SectorPerformance,
  MoverData,
  PriceBar,
  OptionsChainData,
  SymbolSearchResult,
} from './types.js';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

async function finnhubFetch<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const apiKey = process.env.FINNHUB_KEY;
  if (!apiKey) throw new Error('FINNHUB_KEY not configured');

  const url = new URL(`${FINNHUB_BASE}${endpoint}`);
  url.searchParams.set('token', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Finnhub API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export class FinnhubProvider implements MarketDataProvider {
  name = 'finnhub';

  async getQuote(symbol: string): Promise<QuoteData> {
    const [quote, profile] = await Promise.all([
      finnhubFetch<any>('/quote', { symbol }),
      finnhubFetch<any>('/stock/profile2', { symbol }).catch(() => null),
    ]);

    return {
      symbol,
      name: profile?.name || symbol,
      price: quote.c ?? 0,
      change: quote.d ?? 0,
      changePercent: quote.dp ?? 0,
      open: quote.o ?? 0,
      high: quote.h ?? 0,
      low: quote.l ?? 0,
      previousClose: quote.pc ?? 0,
      volume: 0, // Finnhub quote endpoint doesn't return volume
      marketCap: profile?.marketCapitalization ? profile.marketCapitalization * 1e6 : undefined,
    };
  }

  async getMultipleQuotes(symbols: string[]): Promise<QuoteData[]> {
    const results = await Promise.allSettled(
      symbols.map(s => this.getQuote(s))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<QuoteData> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  async getNews(query?: string, category?: string): Promise<NewsItem[]> {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const from = weekAgo.toISOString().split('T')[0];
    const to = today.toISOString().split('T')[0];

    let items: any[];
    if (query && query !== 'stock market') {
      // Company-specific news
      items = await finnhubFetch<any[]>('/company-news', {
        symbol: query,
        from,
        to,
      });
    } else {
      // General market news
      items = await finnhubFetch<any[]>('/news', {
        category: category || 'general',
      });
    }

    return (items || []).slice(0, 20).map((item: any) => ({
      id: `fh-${item.id}`,
      headline: item.headline || '',
      summary: item.summary || '',
      source: item.source || 'Finnhub',
      url: item.url || '',
      datetime: item.datetime || Date.now() / 1000,
      category: item.category,
      related: item.related,
    }));
  }

  async getSectorPerformance(): Promise<SectorPerformance[]> {
    // Finnhub doesn't have a direct sector performance endpoint
    // This would need to be built from ETF quotes — defer to Yahoo provider
    return [];
  }

  async getTopMovers(): Promise<MoverData> {
    // Finnhub doesn't have a direct movers endpoint on free tier
    return { gainers: [], losers: [] };
  }

  async getOptionsChain(_symbol: string, _expiration?: string): Promise<OptionsChainData> {
    // Finnhub options are limited on free tier — defer to Yahoo
    return { symbol: _symbol, expirationDate: '', calls: [], puts: [] };
  }

  async getHistoricalPrices(symbol: string, range: string): Promise<PriceBar[]> {
    const now = Math.floor(Date.now() / 1000);
    const rangeSeconds: Record<string, number> = {
      '1d': 86400,
      '5d': 5 * 86400,
      '1m': 30 * 86400,
      '3m': 90 * 86400,
      '6m': 180 * 86400,
      '1y': 365 * 86400,
    };

    const seconds = rangeSeconds[range] || rangeSeconds['3m'];
    const resolution = seconds <= 86400 ? '5' : seconds <= 5 * 86400 ? '15' : 'D';

    const data = await finnhubFetch<any>('/stock/candle', {
      symbol,
      resolution,
      from: String(now - seconds),
      to: String(now),
    });

    if (data.s !== 'ok' || !data.t) return [];

    return data.t.map((timestamp: number, i: number) => ({
      date: new Date(timestamp * 1000).toISOString(),
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i],
    }));
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const data = await finnhubFetch<any>('/search', { q: query });
    return (data.result || []).slice(0, 10).map((item: any) => ({
      symbol: item.symbol,
      name: item.description || item.symbol,
      type: item.type || 'Stock',
      exchange: item.displaySymbol || '',
    }));
  }
}
