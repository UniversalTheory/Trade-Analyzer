import { Router } from 'express';
import { getProvider, cachedCall, TTLCache } from '../services/providerRegistry.js';

const router = Router();

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
