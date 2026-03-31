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

const AV_BASE = 'https://www.alphavantage.co/query';

async function avFetch<T>(params: Record<string, string>): Promise<T> {
  const apiKey = process.env.ALPHA_VANTAGE_KEY;
  if (!apiKey) throw new Error('ALPHA_VANTAGE_KEY not configured');

  const url = new URL(AV_BASE);
  url.searchParams.set('apikey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Alpha Vantage API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export class AlphaVantageProvider implements MarketDataProvider {
  name = 'alpha-vantage';

  async getQuote(symbol: string): Promise<QuoteData> {
    const data = await avFetch<any>({
      function: 'GLOBAL_QUOTE',
      symbol,
    });

    const q = data['Global Quote'] || {};
    const price = parseFloat(q['05. price']) || 0;
    const prevClose = parseFloat(q['08. previous close']) || 0;

    return {
      symbol: q['01. symbol'] || symbol,
      name: symbol, // Alpha Vantage GLOBAL_QUOTE doesn't include company name
      price,
      change: parseFloat(q['09. change']) || 0,
      changePercent: parseFloat(q['10. change percent']?.replace('%', '')) || 0,
      open: parseFloat(q['02. open']) || 0,
      high: parseFloat(q['03. high']) || 0,
      low: parseFloat(q['04. low']) || 0,
      previousClose: prevClose,
      volume: parseInt(q['06. volume']) || 0,
    };
  }

  async getMultipleQuotes(symbols: string[]): Promise<QuoteData[]> {
    // Alpha Vantage doesn't support batch quotes on free tier
    // Rate limit: 5 calls/min, so we limit parallel calls
    const results = await Promise.allSettled(
      symbols.slice(0, 5).map(s => this.getQuote(s))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<QuoteData> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  async getNews(query?: string, _category?: string): Promise<NewsItem[]> {
    const params: Record<string, string> = {
      function: 'NEWS_SENTIMENT',
      limit: '20',
    };
    if (query && query !== 'stock market') {
      params.tickers = query;
    }

    const data = await avFetch<any>(params);
    const feed = data.feed || [];

    return feed.map((item: any, idx: number) => ({
      id: `av-${idx}-${Date.now()}`,
      headline: item.title || '',
      summary: item.summary || '',
      source: item.source || 'Alpha Vantage',
      url: item.url || '',
      datetime: item.time_published
        ? new Date(item.time_published.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6')).getTime() / 1000
        : Date.now() / 1000,
      category: _category,
      sentiment: mapSentiment(item.overall_sentiment_score),
    }));
  }

  async getSectorPerformance(): Promise<SectorPerformance[]> {
    const data = await avFetch<any>({ function: 'SECTOR' });

    const realtime = data['Rank A: Real-Time Performance'] || {};
    const sectorMap: Record<string, string> = {
      'Information Technology': 'XLK',
      'Health Care': 'XLV',
      'Financials': 'XLF',
      'Energy': 'XLE',
      'Utilities': 'XLU',
      'Consumer Discretionary': 'XLY',
      'Consumer Staples': 'XLP',
      'Industrials': 'XLI',
      'Materials': 'XLB',
      'Real Estate': 'XLRE',
      'Communication Services': 'XLC',
    };

    return Object.entries(sectorMap).map(([sector, etf]) => ({
      sector,
      etfSymbol: etf,
      changePercent1D: parseFloat(realtime[sector]?.replace('%', '')) || 0,
    }));
  }

  async getTopMovers(): Promise<MoverData> {
    const data = await avFetch<any>({ function: 'TOP_GAINERS_LOSERS' });

    const mapItems = (items: any[]) =>
      (items || []).slice(0, 10).map((item: any) => ({
        symbol: item.ticker,
        name: item.ticker,
        price: parseFloat(item.price) || 0,
        change: parseFloat(item.change_amount) || 0,
        changePercent: parseFloat(item.change_percentage?.replace('%', '')) || 0,
        volume: parseInt(item.volume) || 0,
      }));

    return {
      gainers: mapItems(data.top_gainers),
      losers: mapItems(data.top_losers),
    };
  }

  async getOptionsChain(_symbol: string, _expiration?: string): Promise<OptionsChainData> {
    // Alpha Vantage doesn't provide options chain data on free tier
    return { symbol: _symbol, expirationDate: '', calls: [], puts: [] };
  }

  async getHistoricalPrices(symbol: string, range: string): Promise<PriceBar[]> {
    let fn: string;
    let seriesKey: string;

    if (range === '1d') {
      fn = 'TIME_SERIES_INTRADAY';
      seriesKey = 'Time Series (5min)';
    } else {
      fn = 'TIME_SERIES_DAILY';
      seriesKey = 'Time Series (Daily)';
    }

    const params: Record<string, string> = { function: fn, symbol, outputsize: 'compact' };
    if (range === '1d') params.interval = '5min';

    const data = await avFetch<any>(params);
    const series = data[seriesKey] || {};

    const rangeDays: Record<string, number> = {
      '1d': 1, '5d': 5, '1m': 30, '3m': 90, '6m': 180, '1y': 365,
    };
    const days = rangeDays[range] || 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return Object.entries(series)
      .filter(([date]) => new Date(date) >= cutoff)
      .map(([date, values]: [string, any]) => ({
        date: new Date(date).toISOString(),
        open: parseFloat(values['1. open']) || 0,
        high: parseFloat(values['2. high']) || 0,
        low: parseFloat(values['3. low']) || 0,
        close: parseFloat(values['4. close']) || 0,
        volume: parseInt(values['5. volume']) || 0,
      }))
      .reverse(); // oldest first
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const data = await avFetch<any>({
      function: 'SYMBOL_SEARCH',
      keywords: query,
    });

    return (data.bestMatches || []).map((item: any) => ({
      symbol: item['1. symbol'],
      name: item['2. name'],
      type: item['3. type'] || 'Stock',
      exchange: item['4. region'] || '',
    }));
  }
}

function mapSentiment(score: number | undefined): 'positive' | 'negative' | 'neutral' {
  if (!score) return 'neutral';
  if (score > 0.15) return 'positive';
  if (score < -0.15) return 'negative';
  return 'neutral';
}
