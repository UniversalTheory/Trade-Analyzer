import type { MarketDataProvider } from './types.js';
import { YahooFinanceProvider } from './yahooFinance.js';
import { FinnhubProvider } from './finnhub.js';
import { AlphaVantageProvider } from './alphaVantage.js';
import { cache, TTLCache } from './cache.js';

// Which provider to use for each data type
// Change these to swap providers (e.g., upgrade from free to paid)
type DataCategory =
  | 'quote'
  | 'news'
  | 'sector'
  | 'movers'
  | 'options'
  | 'history'
  | 'search';

const providerMap: Record<DataCategory, () => MarketDataProvider> = {
  quote: () => providers.yahoo,
  news: () => (process.env.FINNHUB_KEY ? providers.finnhub : providers.yahoo),
  sector: () => providers.yahoo,
  movers: () => (process.env.ALPHA_VANTAGE_KEY ? providers.alphaVantage : providers.yahoo),
  options: () => providers.yahoo,
  history: () => providers.yahoo,
  search: () => providers.yahoo,
};

// Lazy-init providers
const providers = {
  yahoo: new YahooFinanceProvider(),
  finnhub: new FinnhubProvider(),
  alphaVantage: new AlphaVantageProvider(),
};

export function getProvider(category: DataCategory): MarketDataProvider {
  return providerMap[category]();
}

// Cached wrapper for common operations
export async function cachedCall<T>(
  cacheKey: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = cache.get<T>(cacheKey);
  if (cached !== null) return cached;

  const data = await fn();
  cache.set(cacheKey, data, ttl);
  return data;
}

export { TTLCache };
