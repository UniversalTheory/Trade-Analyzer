// Normalized data types returned by all providers

export interface QuoteData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  marketCap?: number;
  pe?: number;
  week52High?: number;
  week52Low?: number;
  avgVolume?: number;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  datetime: number; // unix timestamp
  category?: string;
  related?: string; // ticker symbols
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface SectorPerformance {
  sector: string;
  etfSymbol: string;
  changePercent1D: number;
  changePercent1W?: number;
  changePercent1M?: number;
  changePercent3M?: number;
  changePercentYTD?: number;
}

export interface MoverData {
  gainers: MoverItem[];
  losers: MoverItem[];
}

export interface MoverItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

export interface PriceBar {
  date: string; // ISO date string
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OptionsChainData {
  symbol: string;
  expirationDate: string;
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface OptionContract {
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  expiration: string;
  type: 'call' | 'put';
}

export interface SymbolSearchResult {
  symbol: string;
  name: string;
  type: string; // 'Stock', 'ETF', etc.
  exchange: string;
}

export interface MacroData {
  vix: QuoteData | null;
  treasuryYield10Y?: number;
  fearGreedIndex?: number;
}

// Provider interface — all adapters must implement this
export interface MarketDataProvider {
  name: string;

  getQuote(symbol: string): Promise<QuoteData>;
  getMultipleQuotes(symbols: string[]): Promise<QuoteData[]>;
  getNews(query?: string, category?: string): Promise<NewsItem[]>;
  getSectorPerformance(): Promise<SectorPerformance[]>;
  getTopMovers(): Promise<MoverData>;
  getOptionsChain(symbol: string, expiration?: string): Promise<OptionsChainData>;
  getHistoricalPrices(symbol: string, range: string): Promise<PriceBar[]>;
  searchSymbol(query: string): Promise<SymbolSearchResult[]>;
}
