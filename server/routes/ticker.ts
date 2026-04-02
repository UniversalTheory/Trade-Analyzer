import { Router } from 'express';
import YahooFinance from 'yahoo-finance2';
import { getProvider, cachedCall, TTLCache } from '../services/providerRegistry.js';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const router = Router();

// GET /api/ticker/search?q=AAPL - Symbol search / autocomplete
router.get('/search', async (req, res) => {
  try {
    const query = (req.query.q as string) || '';
    if (!query || query.length < 1) {
      return res.json([]);
    }
    const provider = getProvider('search');
    const data = await cachedCall(
      `ticker:search:${query}`,
      TTLCache.TTL.SEARCH,
      () => provider.searchSymbol(query),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Ticker search error:', err.message);
    res.status(500).json({ error: 'Failed to search symbols' });
  }
});

// GET /api/ticker/:symbol/quote - Full quote data
router.get('/:symbol/quote', async (req, res) => {
  try {
    const { symbol } = req.params;
    const provider = getProvider('quote');
    const data = await cachedCall(
      `ticker:quote:${symbol}`,
      TTLCache.TTL.QUOTE,
      () => provider.getQuote(symbol),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Ticker quote error:', err.message);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// GET /api/ticker/:symbol/history?range=3m - Historical OHLCV
router.get('/:symbol/history', async (req, res) => {
  try {
    const { symbol } = req.params;
    const range = (req.query.range as string) || '3m';
    const provider = getProvider('history');
    const data = await cachedCall(
      `ticker:history:${symbol}:${range}`,
      TTLCache.TTL.HISTORY,
      () => provider.getHistoricalPrices(symbol, range),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Ticker history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch historical prices' });
  }
});

// GET /api/ticker/:symbol/news - Ticker-specific news
router.get('/:symbol/news', async (req, res) => {
  try {
    const { symbol } = req.params;
    const provider = getProvider('news');
    const data = await cachedCall(
      `ticker:news:${symbol}`,
      TTLCache.TTL.NEWS,
      () => provider.getNews(symbol),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Ticker news error:', err.message);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// GET /api/ticker/:symbol/profile - Asset description, sector, fund info
router.get('/:symbol/profile', async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await cachedCall(
      `ticker:profile:${symbol}`,
      TTLCache.TTL.SEARCH, // 1 hour — profile data rarely changes
      async () => {
        const summary = await yf.quoteSummary(symbol, {
          modules: ['assetProfile', 'summaryProfile', 'fundProfile'] as any,
        });

        const asset = (summary as any).assetProfile ?? (summary as any).summaryProfile;
        const fund  = (summary as any).fundProfile;

        const description =
          asset?.longBusinessSummary ??
          fund?.longBusinessSummary ??
          '';

        return {
          symbol,
          description,
          sector:       asset?.sector       ?? undefined,
          industry:     asset?.industry     ?? undefined,
          employees:    asset?.fullTimeEmployees ?? undefined,
          country:      asset?.country      ?? undefined,
          website:      asset?.website      ?? undefined,
          fundFamily:   fund?.family        ?? undefined,
          fundCategory: fund?.categoryName  ?? undefined,
          legalType:    fund?.legalType     ?? undefined,
        };
      },
    );
    res.json(data);
  } catch (err: any) {
    console.error('Asset profile error:', err.message);
    res.status(500).json({ error: 'Failed to fetch asset profile' });
  }
});

// GET /api/ticker/:symbol/options?expiration=2026-04-17 - Options chain
router.get('/:symbol/options', async (req, res) => {
  try {
    const { symbol } = req.params;
    const expiration = req.query.expiration as string | undefined;
    const provider = getProvider('options');
    const data = await cachedCall(
      `ticker:options:${symbol}:${expiration || 'default'}`,
      TTLCache.TTL.OPTIONS,
      () => provider.getOptionsChain(symbol, expiration),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Options chain error:', err.message);
    res.status(500).json({ error: 'Failed to fetch options chain' });
  }
});

export default router;
