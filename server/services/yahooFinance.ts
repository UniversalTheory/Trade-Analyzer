import YahooFinance from 'yahoo-finance2';
import type {
  MarketDataProvider,
  QuoteData,
  NewsItem,
  SectorPerformance,
  MoverData,
  MoverItem,
  PriceBar,
  OptionsChainData,
  OptionContract,
  SymbolSearchResult,
} from './types.js';

const yahooFinance = new YahooFinance({
  suppressNotices: ['yahooSurvey'],
});

const SECTOR_ETFS: Record<string, string> = {
  'Technology': 'XLK',
  'Healthcare': 'XLV',
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

function mapQuote(raw: any, symbol: string): QuoteData {
  return {
    symbol: raw.symbol ?? symbol,
    name: raw.shortName ?? raw.longName ?? symbol,
    price: raw.regularMarketPrice ?? 0,
    change: raw.regularMarketChange ?? 0,
    changePercent: raw.regularMarketChangePercent ?? 0,
    open: raw.regularMarketOpen ?? 0,
    high: raw.regularMarketDayHigh ?? 0,
    low: raw.regularMarketDayLow ?? 0,
    previousClose: raw.regularMarketPreviousClose ?? 0,
    volume: raw.regularMarketVolume ?? 0,
    marketCap: raw.marketCap,
    pe: raw.trailingPE,
    week52High: raw.fiftyTwoWeekHigh,
    week52Low: raw.fiftyTwoWeekLow,
    avgVolume: raw.averageDailyVolume3Month,
  };
}

export class YahooFinanceProvider implements MarketDataProvider {
  name = 'yahoo-finance';

  async getQuote(symbol: string): Promise<QuoteData> {
    const raw = await yahooFinance.quote(symbol);
    return mapQuote(raw, symbol);
  }

  async getMultipleQuotes(symbols: string[]): Promise<QuoteData[]> {
    const results = await Promise.allSettled(
      symbols.map(s => yahooFinance.quote(s))
    );
    return results
      .map((r, i) => {
        if (r.status === 'fulfilled') return mapQuote(r.value, symbols[i]);
        console.error(`Failed to fetch quote for ${symbols[i]}:`, r.reason);
        return null;
      })
      .filter((q): q is QuoteData => q !== null);
  }

  async getNews(_query?: string, _category?: string): Promise<NewsItem[]> {
    // Yahoo Finance search provides news results
    try {
      const result = await yahooFinance.search(_query || 'stock market', {
        newsCount: 20,
        quotesCount: 0,
      });

      return (result.news || []).map((item: any, idx: number) => ({
        id: `yf-${idx}-${item.uuid || Date.now()}`,
        headline: item.title || '',
        summary: item.publisher || '',
        source: item.publisher || 'Yahoo Finance',
        url: item.link || '',
        datetime: item.providerPublishTime
          ? new Date(item.providerPublishTime).getTime() / 1000
          : Date.now() / 1000,
        category: _category,
        related: _query,
      }));
    } catch (err) {
      console.error('Yahoo Finance news error:', err);
      return [];
    }
  }

  async getSectorPerformance(): Promise<SectorPerformance[]> {
    const etfSymbols = Object.values(SECTOR_ETFS);
    const quotes = await this.getMultipleQuotes(etfSymbols);

    return Object.entries(SECTOR_ETFS).map(([sector, etf]) => {
      const quote = quotes.find(q => q.symbol === etf);
      return {
        sector,
        etfSymbol: etf,
        changePercent1D: quote?.changePercent ?? 0,
      };
    });
  }

  async getTopMovers(): Promise<MoverData> {
    // Use Yahoo Finance's trending tickers and pre-market/post-market movers
    try {
      const trending = await yahooFinance.trendingSymbols('US', { count: 20 });
      const symbols = (trending.quotes || [])
        .map((q: any) => q.symbol)
        .filter(Boolean)
        .slice(0, 20);

      if (symbols.length === 0) {
        return { gainers: [], losers: [] };
      }

      const quotes = await this.getMultipleQuotes(symbols);

      const sorted = quotes
        .filter(q => q.changePercent !== 0)
        .sort((a, b) => b.changePercent - a.changePercent);

      const toMover = (q: QuoteData): MoverItem => ({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
      });

      return {
        gainers: sorted.filter(q => q.changePercent > 0).slice(0, 10).map(toMover),
        losers: sorted.filter(q => q.changePercent < 0).slice(-10).reverse().map(toMover),
      };
    } catch (err) {
      console.error('Yahoo Finance movers error:', err);
      return { gainers: [], losers: [] };
    }
  }

  async getOptionsChain(symbol: string, expiration?: string): Promise<OptionsChainData> {
    const opts: any = {};
    if (expiration) {
      opts.date = new Date(expiration);
    }

    const result = await yahooFinance.options(symbol, opts);

    const mapContract = (c: any, type: 'call' | 'put'): OptionContract => ({
      strike: c.strike ?? 0,
      lastPrice: c.lastPrice ?? 0,
      bid: c.bid ?? 0,
      ask: c.ask ?? 0,
      volume: c.volume ?? 0,
      openInterest: c.openInterest ?? 0,
      impliedVolatility: c.impliedVolatility ?? 0,
      inTheMoney: c.inTheMoney ?? false,
      expiration: expiration || result.expirationDates?.[0]?.toISOString() || '',
      type,
    });

    return {
      symbol,
      expirationDate: expiration || result.expirationDates?.[0]?.toISOString() || '',
      calls: (result.options?.[0]?.calls || []).map((c: any) => mapContract(c, 'call')),
      puts: (result.options?.[0]?.puts || []).map((c: any) => mapContract(c, 'put')),
    };
  }

  async getHistoricalPrices(symbol: string, range: string): Promise<PriceBar[]> {
    // Map range string to yahoo-finance2 period/interval
    const rangeMap: Record<string, { period1: Date; interval: '1d' | '1wk' | '1mo' | '5m' | '15m' | '1h' }> = {
      '1d': { period1: daysAgo(1), interval: '5m' },
      '5d': { period1: daysAgo(5), interval: '15m' },
      '1m': { period1: daysAgo(30), interval: '1d' },
      '3m': { period1: daysAgo(90), interval: '1d' },
      '6m': { period1: daysAgo(180), interval: '1d' },
      '1y': { period1: daysAgo(365), interval: '1wk' },
      '5y': { period1: daysAgo(365 * 5), interval: '1mo' },
    };

    const config = rangeMap[range] || rangeMap['3m'];

    const result = await yahooFinance.chart(symbol, {
      period1: config.period1,
      interval: config.interval,
    });

    return (result.quotes || []).map((bar: any) => ({
      date: bar.date?.toISOString() || '',
      open: bar.open ?? 0,
      high: bar.high ?? 0,
      low: bar.low ?? 0,
      close: bar.close ?? 0,
      volume: bar.volume ?? 0,
    }));
  }

  async searchSymbol(query: string): Promise<SymbolSearchResult[]> {
    const result = await yahooFinance.search(query, {
      quotesCount: 10,
      newsCount: 0,
    });

    return (result.quotes || [])
      .filter((q: any) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
      .map((q: any) => ({
        symbol: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        type: q.quoteType || 'Stock',
        exchange: q.exchange || '',
      }));
  }
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
