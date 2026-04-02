// Client-side types matching server response shapes

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
  datetime: number;
  category?: string;
  related?: string;
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
  date: string;
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
  type: string;
  exchange: string;
}

export interface SectorDefinition {
  id: string;
  name: string;
  etf: string;
  category: 'broad' | 'sub-sector';
  description: string;
  topHoldings: string[];
  newsKeywords: string[];
}

export interface AssetProfile {
  symbol: string;
  description: string;
  sector?: string;
  industry?: string;
  employees?: number;
  country?: string;
  website?: string;
  fundFamily?: string;
  fundCategory?: string;
  legalType?: string;
}

export interface HealthCheck {
  status: string;
  providers: {
    alphaVantage: boolean;
    finnhub: boolean;
    anthropic: boolean;
  };
}
