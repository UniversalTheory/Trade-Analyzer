import { Router } from 'express';
import yahooFinance from 'yahoo-finance2';
import { getProvider, cachedCall, TTLCache } from '../services/providerRegistry.js';
import { SECTORS, ETF_TO_SECTOR } from '../data/sectors.js'; // SECTORS used in /list route

const router = Router();

// GET /api/sector/list - All sector definitions (static)
router.get('/list', (_req, res) => {
  res.json(SECTORS);
});

// GET /api/sector/performance - All sector performance data
router.get('/performance', async (_req, res) => {
  try {
    const provider = getProvider('sector');
    const data = await cachedCall(
      'sector:performance',
      TTLCache.TTL.SECTOR,
      () => provider.getSectorPerformance(),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Sector performance error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sector performance' });
  }
});

// GET /api/sector/:symbol/quote - Quote for a sector ETF
router.get('/:symbol/quote', async (req, res) => {
  try {
    const { symbol } = req.params;
    const provider = getProvider('quote');
    const data = await cachedCall(
      `sector:quote:${symbol}`,
      TTLCache.TTL.QUOTE,
      () => provider.getQuote(symbol),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Sector quote error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sector quote' });
  }
});

// GET /api/sector/:symbol/history?range=3m - Historical prices for sector ETF
router.get('/:symbol/history', async (req, res) => {
  try {
    const { symbol } = req.params;
    const range = (req.query.range as string) || '3m';
    const provider = getProvider('history');
    const data = await cachedCall(
      `sector:history:${symbol}:${range}`,
      TTLCache.TTL.HISTORY,
      () => provider.getHistoricalPrices(symbol, range),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Sector history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sector history' });
  }
});

// GET /api/sector/:etf/movers - Top movers within a sector ETF's holdings
router.get('/:etf/movers', async (req, res) => {
  try {
    const { etf } = req.params;
    const provider = getProvider('quote');

    const data = await cachedCall(
      `sector:movers:${etf}`,
      TTLCache.TTL.MOVERS,
      async () => {
        // Try to get holdings from Yahoo's ETF data, fall back to static list
        let symbols: string[] = [];
        try {
          const summary = await yahooFinance.quoteSummary(etf, { modules: ['topHoldings'] });
          const holdings = summary?.topHoldings?.holdings ?? [];
          symbols = holdings
            .map((h: any) => h.symbol)
            .filter(Boolean)
            .slice(0, 15);
        } catch {
          // ignore — use static fallback below
        }

        if (symbols.length === 0) {
          symbols = ETF_TO_SECTOR[etf]?.topHoldings ?? [];
        }

        if (symbols.length === 0) return { gainers: [], losers: [] };

        const quotes = await provider.getMultipleQuotes(symbols);
        const sorted = quotes
          .filter(q => q.changePercent !== 0)
          .sort((a, b) => b.changePercent - a.changePercent);

        return {
          gainers: sorted.filter(q => q.changePercent > 0).slice(0, 8).map(q => ({
            symbol: q.symbol, name: q.name, price: q.price,
            change: q.change, changePercent: q.changePercent, volume: q.volume,
          })),
          losers: sorted.filter(q => q.changePercent < 0).slice(-8).reverse().map(q => ({
            symbol: q.symbol, name: q.name, price: q.price,
            change: q.change, changePercent: q.changePercent, volume: q.volume,
          })),
        };
      },
    );

    res.json(data);
  } catch (err: any) {
    console.error('Sector movers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sector movers' });
  }
});

// GET /api/sector/:symbol/news - News related to sector ETF
router.get('/:symbol/news', async (req, res) => {
  try {
    const { symbol } = req.params;
    const provider = getProvider('news');
    const data = await cachedCall(
      `sector:news:${symbol}`,
      TTLCache.TTL.NEWS,
      () => provider.getNews(symbol),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Sector news error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sector news' });
  }
});

export default router;
