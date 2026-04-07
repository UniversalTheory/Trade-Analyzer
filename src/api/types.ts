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
  irWebsite?: string;
  fundFamily?: string;
  fundCategory?: string;
  legalType?: string;
}

export interface FundamentalsData {
  marketCap?: number;
  trailingPE?: number;
  forwardPE?: number;
  priceToSales?: number;
  priceToBook?: number;
  evToEbitda?: number;
  enterpriseValue?: number;
  revenue?: number;
  grossMargin?: number;
  ebitdaMargin?: number;
  operatingMargin?: number;
  netMargin?: number;
  roe?: number;
  roa?: number;
  currentRatio?: number;
  debtToEquity?: number;
  freeCashFlow?: number;
  cash?: number;
  totalDebt?: number;
  operatingCashFlow?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  beta?: number;
  sharesOutstanding?: number;
  shortPercentFloat?: number;
  dividendYield?: number;
  payoutRatio?: number;
  insiderHeld?: number;
  institutionHeld?: number;
  targetHigh?: number;
  targetLow?: number;
  targetMean?: number;
  recommendation?: string;
  analystCount?: number;
}

export interface EconomicEvent {
  event: string;
  country: string;
  time: string;
  impact: 'high' | 'medium' | 'low';
  actual?: number | null;
  estimate?: number | null;
  prev?: number | null;
  unit?: string;
}

export interface FilingsData {
  available: boolean;
  symbol: string;
  companyName?: string;
  cik?: number;
  mostRecent10K?: {
    filingDate: string;
    reportDate: string;
    url: string;
  };
  edgarUrl?: string;
}

export interface EarningsQuarter {
  period: string;           // e.g. "Q3 '23"
  epsActual?: number;
  epsEstimate?: number;
  epsSurprisePct?: number;  // positive = beat, negative = miss
  revenueActual?: number;   // in raw dollars
}

export interface EarningsData {
  symbol: string;
  nextEarningsDate?: string;     // ISO date string (YYYY-MM-DD)
  nextEarningsDateEnd?: string;  // end of window if range
  quarters: EarningsQuarter[];   // chronological order, oldest → newest
}

export interface HealthCheck {
  status: string;
  providers: {
    alphaVantage: boolean;
    finnhub: boolean;
    fred: boolean;
    anthropic: boolean;
  };
}
