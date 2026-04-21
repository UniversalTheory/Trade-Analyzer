import { Router } from 'express';
import { getProvider, cachedCall, TTLCache } from '../services/providerRegistry.js';

const router = Router();

// Curated FRED release IDs → display name, impact level, and typical ET release time.
// IDs verified via fred/series/release lookups. Names hardcoded for reliability.
// NOTE: ISM Manufacturing/Services PMI and Conference Board Consumer Confidence exist
// as FRED series but have no release_id, so they cannot be pulled via release/dates.
const FRED_RELEASE_META: Record<number, { name: string; impact: 'high' | 'medium'; timeET: string }> = {
  // ── Tier 1: major market movers ──────────────────────────────────────────
  50:  { name: 'Employment Situation (NFP)',         impact: 'high',   timeET: '08:30' },
  10:  { name: 'Consumer Price Index (CPI)',         impact: 'high',   timeET: '08:30' },
  46:  { name: 'Producer Price Index (PPI)',         impact: 'high',   timeET: '08:30' },
  53:  { name: 'Gross Domestic Product (GDP)',       impact: 'high',   timeET: '08:30' },
  54:  { name: 'Personal Income & Outlays (PCE)',    impact: 'high',   timeET: '08:30' },
  9:   { name: 'Retail Sales',                       impact: 'high',   timeET: '08:30' },
  180: { name: 'Initial Jobless Claims',             impact: 'high',   timeET: '08:30' },
  192: { name: 'JOLTS Job Openings',                 impact: 'high',   timeET: '10:00' },
  194: { name: 'ADP Employment Report',              impact: 'high',   timeET: '08:15' },
  // ── Tier 2: significant secondary releases ───────────────────────────────
  13:  { name: 'Industrial Production',              impact: 'medium', timeET: '09:15' },
  27:  { name: 'Housing Starts & Building Permits',  impact: 'medium', timeET: '08:30' },
  51:  { name: 'Trade Balance',                      impact: 'medium', timeET: '08:30' },
  91:  { name: 'Consumer Sentiment (U. Michigan)',   impact: 'medium', timeET: '10:00' },
  95:  { name: 'Durable Goods & Factory Orders',     impact: 'medium', timeET: '08:30' },
  97:  { name: 'New Home Sales',                     impact: 'medium', timeET: '10:00' },
  188: { name: 'Import & Export Prices',             impact: 'medium', timeET: '08:30' },
  229: { name: 'Construction Spending',              impact: 'medium', timeET: '10:00' },
  291: { name: 'Existing Home Sales',                impact: 'medium', timeET: '10:00' },
  321: { name: 'Empire State Mfg Survey',            impact: 'medium', timeET: '08:30' },
  351: { name: 'Philadelphia Fed Mfg Survey',        impact: 'medium', timeET: '08:30' },
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
    const symbols = ['CL=F', 'BZ=F', 'GC=F', 'SI=F', 'HG=F', 'BTC-USD'];
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

        // One request per release ID (fred/release/dates, singular) to guarantee
        // isolation — the bulk releases/dates endpoint bleeds in daily treasury
        // releases that share numeric IDs with economic releases.
        const releaseIds = Object.keys(FRED_RELEASE_META).map(Number);
        const perRelease = await Promise.all(
          releaseIds.map(async (releaseId) => {
            const meta = FRED_RELEASE_META[releaseId];
            const url = new URL('https://api.stlouisfed.org/fred/release/dates');
            url.searchParams.set('release_id', String(releaseId));
            url.searchParams.set('realtime_start', fmt(from));
            url.searchParams.set('realtime_end', fmt(to));
            url.searchParams.set('include_release_dates_with_no_data', 'true');
            url.searchParams.set('limit', '50');
            url.searchParams.set('sort_order', 'asc');
            url.searchParams.set('file_type', 'json');
            url.searchParams.set('api_key', fredKey);
            try {
              const resp = await fetch(url.toString());
              if (!resp.ok) return [];
              const raw: any = await resp.json();
              return (raw.release_dates ?? []).map((r: any) => ({
                event:    meta.name,
                country:  'US',
                time:     etToIso(r.date, meta.timeET),
                impact:   meta.impact,
                actual:   null,
                estimate: null,
                prev:     null,
                unit:     '',
              }));
            } catch {
              return [];
            }
          }),
        );

        const events = perRelease
          .flat()
          .sort((a, b) => a.time.localeCompare(b.time));

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
