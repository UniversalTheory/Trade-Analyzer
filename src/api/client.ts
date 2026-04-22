const API_BASE = '/api';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json() as Promise<T>;
}

// Market endpoints
export const market = {
  getIndices: (live = false) => request<import('./types').QuoteData[]>(`/market/indices${live ? '?live=true' : ''}`),
  getMovers: (live = false) => request<import('./types').MoverData>(`/market/movers${live ? '?live=true' : ''}`),
  getNews: () => request<import('./types').NewsItem[]>('/market/news'),
  getSectors: () => request<import('./types').SectorPerformance[]>('/market/sectors'),
  getFutures: (live = false) => request<import('./types').QuoteData[]>(`/market/futures${live ? '?live=true' : ''}`),
  getInternational: () => request<import('./types').QuoteData[]>('/market/international'),
  getCommodities: (live = false) => request<import('./types').QuoteData[]>(`/market/commodities${live ? '?live=true' : ''}`),
  getCalendar: () => request<{ events: import('./types').EconomicEvent[]; unavailable?: boolean }>('/market/calendar'),
};

// Sector endpoints
export const sector = {
  getList: () => request<import('./types').SectorDefinition[]>('/sector/list'),
  getPerformance: () => request<import('./types').SectorPerformance[]>('/sector/performance'),
  getQuote: (symbol: string) => request<import('./types').QuoteData>(`/sector/${symbol}/quote`),
  getHistory: (symbol: string, range = '3m') =>
    request<import('./types').PriceBar[]>(`/sector/${symbol}/history?range=${range}`),
  getNews: (symbol: string) => request<import('./types').NewsItem[]>(`/sector/${symbol}/news`),
  getSectorMovers: (etf: string) => request<import('./types').MoverData>(`/sector/${etf}/movers`),
};

// Ticker endpoints
export const ticker = {
  search: (q: string) => request<import('./types').SymbolSearchResult[]>(`/ticker/search?q=${encodeURIComponent(q)}`),
  getQuote: (symbol: string) => request<import('./types').QuoteData>(`/ticker/${symbol}/quote`),
  getHistory: (symbol: string, range = '3m', interval = '1d') =>
    request<import('./types').PriceBar[]>(`/ticker/${symbol}/history?range=${range}&interval=${interval}`),
  getNews: (symbol: string) => request<import('./types').NewsItem[]>(`/ticker/${symbol}/news`),
  getProfile: (symbol: string) => request<import('./types').AssetProfile>(`/ticker/${symbol}/profile`),
  getFundamentals: (symbol: string) => request<import('./types').FundamentalsData>(`/ticker/${symbol}/fundamentals`),
  getFilings: (symbol: string) => request<import('./types').FilingsData>(`/ticker/${symbol}/filings`),
  getOptions: (symbol: string, expiration?: string) => {
    const params = expiration ? `?expiration=${expiration}` : '';
    return request<import('./types').OptionsChainData>(`/ticker/${symbol}/options${params}`);
  },
  getEarnings: (symbol: string) =>
    request<import('./types').EarningsData>(`/ticker/${symbol}/earnings`),
};

// Health check
export const health = () => request<import('./types').HealthCheck>('/health');
