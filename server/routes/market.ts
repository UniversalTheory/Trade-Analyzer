import { Router } from 'express';
import { getProvider, cachedCall, TTLCache } from '../services/providerRegistry.js';

const router = Router();

// GET /api/market/indices - Major market indices
router.get('/indices', async (req, res) => {
  try {
    const symbols = ['^GSPC', '^IXIC', '^DJI', '^RUT', '^VIX'];
    const provider = getProvider('quote');
    const isLive = req.query.live === 'true';
    const data = isLive
      ? await provider.getMultipleQuotes(symbols)
      : await cachedCall('market:indices', TTLCache.TTL.QUOTE, () => provider.getMultipleQuotes(symbols));
    res.json(data);
  } catch (err: any) {
    console.error('Market indices error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market indices' });
  }
});

// GET /api/market/movers - Top gainers and losers
router.get('/movers', async (req, res) => {
  try {
    const provider = getProvider('movers');
    const isLive = req.query.live === 'true';
    const data = isLive
      ? await provider.getTopMovers()
      : await cachedCall('market:movers', TTLCache.TTL.MOVERS, () => provider.getTopMovers());
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

// GET /api/market/futures - US equity futures
router.get('/futures', async (req, res) => {
  try {
    const symbols = ['ES=F', 'YM=F', 'NQ=F', 'RTY=F', '^TNX', '^TYX'];
    const provider = getProvider('quote');
    const isLive = req.query.live === 'true';
    const data = isLive
      ? await provider.getMultipleQuotes(symbols)
      : await cachedCall('market:futures', TTLCache.TTL.QUOTE, () => provider.getMultipleQuotes(symbols));
    res.json(data);
  } catch (err: any) {
    console.error('Futures error:', err.message);
    res.status(500).json({ error: 'Failed to fetch futures' });
  }
});

// GET /api/market/international - Major international indices
router.get('/international', async (_req, res) => {
  try {
    const symbols = ['^FTSE', '^GDAXI', '^FCHI', '^STOXX50E', '^N225', '^HSI', '000001.SS', '^AXJO'];
    const provider = getProvider('quote');
    const data = await cachedCall('market:international', 2 * 60 * 1000, () => provider.getMultipleQuotes(symbols));
    res.json(data);
  } catch (err: any) {
    console.error('International indices error:', err.message);
    res.status(500).json({ error: 'Failed to fetch international indices' });
  }
});

// GET /api/market/commodities - Major commodities
router.get('/commodities', async (req, res) => {
  try {
    const symbols = ['CL=F', 'BZ=F', 'GC=F', 'SI=F', 'HG=F'];
    const provider = getProvider('quote');
    const isLive = req.query.live === 'true';
    const data = isLive
      ? await provider.getMultipleQuotes(symbols)
      : await cachedCall('market:commodities', TTLCache.TTL.QUOTE, () => provider.getMultipleQuotes(symbols));
    res.json(data);
  } catch (err: any) {
    console.error('Commodities error:', err.message);
    res.status(500).json({ error: 'Failed to fetch commodities' });
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
