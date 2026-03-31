import { Router } from 'express';
import { getProvider, cachedCall, TTLCache } from '../services/providerRegistry.js';

const router = Router();

// GET /api/market/indices - Major market indices
router.get('/indices', async (_req, res) => {
  try {
    const symbols = ['SPY', 'QQQ', 'DIA', 'IWM', '^VIX'];
    const provider = getProvider('quote');
    const data = await cachedCall(
      'market:indices',
      TTLCache.TTL.QUOTE,
      () => provider.getMultipleQuotes(symbols),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Market indices error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market indices' });
  }
});

// GET /api/market/movers - Top gainers and losers
router.get('/movers', async (_req, res) => {
  try {
    const provider = getProvider('movers');
    const data = await cachedCall(
      'market:movers',
      TTLCache.TTL.MOVERS,
      () => provider.getTopMovers(),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Market movers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market movers' });
  }
});

// GET /api/market/news - General market news
router.get('/news', async (_req, res) => {
  try {
    const provider = getProvider('news');
    const data = await cachedCall(
      'market:news',
      TTLCache.TTL.NEWS,
      () => provider.getNews(),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Market news error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market news' });
  }
});

// GET /api/market/sectors - Sector performance
router.get('/sectors', async (_req, res) => {
  try {
    const provider = getProvider('sector');
    const data = await cachedCall(
      'market:sectors',
      TTLCache.TTL.SECTOR,
      () => provider.getSectorPerformance(),
    );
    res.json(data);
  } catch (err: any) {
    console.error('Sector performance error:', err.message);
    res.status(500).json({ error: 'Failed to fetch sector performance' });
  }
});

export default router;
