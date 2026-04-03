import { Router } from 'express';
import { getProvider, cachedCall, TTLCache } from '../services/providerRegistry.js';

const router = Router();

// Curated FRED release IDs → impact level and typical ET release time
// release_name comes from the FRED API response (more accurate than hardcoding)
const FRED_RELEASE_META: Record<number, { impact: 'high' | 'medium'; timeET: string }> = {
  50:  { impact: 'high',   timeET: '08:30' }, // Employment Situation (NFP, Unemployment, Wages)
  10:  { impact: 'high',   timeET: '08:30' }, // Consumer Price Index (CPI)
  246: { impact: 'high',   timeET: '08:30' }, // Producer Price Index (PPI)
  53:  { impact: 'high',   timeET: '08:30' }, // Gross Domestic Product (GDP)
  21:  { impact: 'high',   timeET: '08:30' }, // Personal Income & Outlays (PCE)
  80:  { impact: 'high',   timeET: '08:30' }, // Retail Sales
  72:  { impact: 'medium', timeET: '08:30' }, // Durable Goods Orders
  11:  { impact: 'medium', timeET: '08:30' }, // Housing Starts
  13:  { impact: 'medium', timeET: '09:15' }, // Industrial Production & Capacity Utilization
  167: { impact: 'medium', timeET: '08:30' }, // Initial Jobless Claims
  25:  { impact: 'medium', timeET: '08:30' }, // Trade Balance
  144: { impact: 'medium', timeET: '10:00' }, // Consumer Sentiment (Univ. of Michigan)
};

// Convert a FRED date string + ET time to a proper ISO timestamp with timezone offset.
// Dynamically accounts for EDT (-04:00) vs EST (-05:00) based on the actual date.
function etToIso(dateStr: string, timeHHMM: string): string {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(probe);
  const etNoonHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '8') % 24;
  const offsetHours = etNoonHour - 12; // e.g. 8 - 12 = -4 for EDT, 7 - 12 = -5 for EST
  const sign = offsetHours <= 0 ? '-' : '+';
  const abs = Math.abs(offsetHours);
  return `${dateStr}T${timeHHMM}:00${sign}${String(abs).padStart(2, '0')}:00`;
}

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

// GET /api/market/calendar - US economic calendar via FRED
router.get('/calendar', async (_req, res) => {
  try {
    const fredKey = process.env.FRED_KEY;
    if (!fredKey) {
      return res.json({ events: [], unavailable: true });
    }

    const data = await cachedCall(
      'market:calendar',
      30 * 60 * 1000, // 30 min — re-fetch periodically so recently-published actuals appear
      async () => {
        const today = new Date();
        const from = new Date(today);
        from.setDate(from.getDate() - 7);   // 1 week back (catch recent releases)
        const to = new Date(today);
        to.setDate(to.getDate() + 28);       // 4 weeks ahead

        const fmt = (d: Date) => d.toISOString().split('T')[0];
        const url = new URL('https://api.stlouisfed.org/fred/releases/dates');
        url.searchParams.set('realtime_start', fmt(from));
        url.searchParams.set('realtime_end', fmt(to));
        url.searchParams.set('include_release_dates_with_no_data', 'true');
        url.searchParams.set('limit', '1000');
        url.searchParams.set('order_by', 'release_date');
        url.searchParams.set('sort_order', 'asc');
        url.searchParams.set('file_type', 'json');
        url.searchParams.set('api_key', fredKey);

        const resp = await fetch(url.toString());
        if (!resp.ok) throw new Error(`FRED calendar error: ${resp.status}`);
        const raw: any = await resp.json();

        const releaseDates: any[] = raw.release_dates ?? [];

        const events = releaseDates
          .filter((r: any) => FRED_RELEASE_META[r.release_id] !== undefined)
          .map((r: any) => {
            const meta = FRED_RELEASE_META[r.release_id];
            return {
              event:    r.release_name ?? `Release ${r.release_id}`,
              country:  'US',
              time:     etToIso(r.date, meta.timeET),
              impact:   meta.impact,
              actual:   null,  // FRED releases/dates doesn't include values; use series data later
              estimate: null,
              prev:     null,
              unit:     '',
            };
          });

        return { events, unavailable: false };
      },
    );

    res.json(data);
  } catch (err: any) {
    console.error('Economic calendar error:', err.message);
    res.status(500).json({ error: 'Failed to fetch economic calendar' });
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
