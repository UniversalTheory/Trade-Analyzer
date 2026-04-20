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
          sector:       asset?.sector              ?? undefined,
          industry:     asset?.industry            ?? undefined,
          employees:    asset?.fullTimeEmployees   ?? undefined,
          country:      asset?.country             ?? undefined,
          website:      asset?.website             ?? undefined,
          irWebsite:    asset?.irWebsite           ?? undefined,
          fundFamily:   fund?.family               ?? undefined,
          fundCategory: fund?.categoryName         ?? undefined,
          legalType:    fund?.legalType            ?? undefined,
        };
      },
    );
    res.json(data);
  } catch (err: any) {
    console.error('Asset profile error:', err.message);
    res.status(500).json({ error: 'Failed to fetch asset profile' });
  }
});

// GET /api/ticker/:symbol/fundamentals - Key financial metrics
router.get('/:symbol/fundamentals', async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await cachedCall(
      `ticker:fundamentals:${symbol}`,
      5 * 60 * 1000,
      async () => {
        const summary = await yf.quoteSummary(symbol, {
          modules: ['financialData', 'defaultKeyStatistics', 'summaryDetail'] as any,
        });
        const fd = (summary as any).financialData         ?? {};
        const ks = (summary as any).defaultKeyStatistics  ?? {};
        const sd = (summary as any).summaryDetail         ?? {};

        const n = (v: any) => (typeof v === 'number' && isFinite(v) ? v : undefined);

        return {
          // Valuation
          marketCap:      n(sd.marketCap),
          trailingPE:     n(sd.trailingPE),
          forwardPE:      n(sd.forwardPE ?? ks.forwardPE),
          priceToSales:   n(sd.priceToSalesTrailing12Months),
          priceToBook:    n(ks.priceToBook),
          evToEbitda:     n(ks.enterpriseToEbitda),
          enterpriseValue: n(ks.enterpriseValue),
          // Profitability
          revenue:         n(fd.totalRevenue),
          grossMargin:     n(fd.grossMargins),
          ebitdaMargin:    n(fd.ebitdaMargins),
          operatingMargin: n(fd.operatingMargins),
          netMargin:       n(fd.profitMargins),
          roe:             n(fd.returnOnEquity),
          roa:             n(fd.returnOnAssets),
          // Financial Health
          currentRatio:     n(fd.currentRatio),
          debtToEquity:     n(fd.debtToEquity),
          freeCashFlow:     n(fd.freeCashflow),
          cash:             n(fd.totalCash),
          totalDebt:        n(fd.totalDebt),
          operatingCashFlow: n(fd.operatingCashflow),
          // Growth
          revenueGrowth:  n(fd.revenueGrowth),
          earningsGrowth: n(fd.earningsGrowth),
          // Share Data
          beta:               n(ks.beta ?? sd.beta),
          sharesOutstanding:  n(ks.sharesOutstanding),
          shortPercentFloat:  n(ks.shortPercentOfFloat),
          dividendYield:      n(sd.dividendYield),
          payoutRatio:        n(sd.payoutRatio),
          insiderHeld:        n(ks.heldPercentInsiders),
          institutionHeld:    n(ks.heldPercentInstitutions),
          // Analyst consensus
          targetHigh:     n(fd.targetHighPrice),
          targetLow:      n(fd.targetLowPrice),
          targetMean:     n(fd.targetMeanPrice),
          recommendation: typeof fd.recommendationKey === 'string' ? fd.recommendationKey : undefined,
          analystCount:   n(fd.numberOfAnalystOpinions),
        };
      },
    );
    res.json(data);
  } catch (err: any) {
    console.error('Fundamentals error:', err.message);
    res.status(500).json({ error: 'Failed to fetch fundamentals' });
  }
});

// GET /api/ticker/:symbol/filings - Most recent 10-K via SEC EDGAR
router.get('/:symbol/filings', async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await cachedCall(
      `ticker:filings:${symbol}`,
      24 * 60 * 60 * 1000, // 24 hours — filings change rarely
      async () => {
        const SEC_HEADERS = {
          'User-Agent': 'GlobalMarketsLookingGlass/1.0 contact@example.com',
          'Accept': 'application/json',
        };

        // 1. Get CIK by ticker
        const tickersResp = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: SEC_HEADERS });
        if (!tickersResp.ok) return { available: false, symbol };
        const tickers: Record<string, { cik_str: number; ticker: string; title: string }> = await tickersResp.json();

        const entry = Object.values(tickers).find(e => e.ticker === symbol.toUpperCase());
        if (!entry) return { available: false, symbol };

        const cik = String(entry.cik_str).padStart(10, '0');
        const edgarUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K&dateb=&owner=include&count=10`;

        // 2. Get submissions to find most recent 10-K
        const subResp = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: SEC_HEADERS });
        if (!subResp.ok) return { available: true, symbol, cik: entry.cik_str, edgarUrl };
        const sub: any = await subResp.json();

        const forms: string[]  = sub.filings?.recent?.form         ?? [];
        const dates: string[]  = sub.filings?.recent?.filingDate   ?? [];
        const periods: string[] = sub.filings?.recent?.reportDate  ?? [];
        const accNums: string[] = sub.filings?.recent?.accessionNumber ?? [];

        const idx = forms.findIndex(f => f === '10-K');
        if (idx === -1) return { available: true, symbol, cik: entry.cik_str, companyName: sub.name, edgarUrl };

        const accNum = accNums[idx].replace(/-/g, '');
        const filingUrl = `https://www.sec.gov/Archives/edgar/data/${entry.cik_str}/${accNum}/`;

        return {
          available: true,
          symbol,
          cik: entry.cik_str,
          companyName: sub.name,
          mostRecent10K: {
            filingDate: dates[idx],
            reportDate: periods[idx],
            url: filingUrl,
          },
          edgarUrl,
        };
      },
    );
    res.json(data);
  } catch (err: any) {
    console.error('Filings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch filings' });
  }
});

// GET /api/ticker/:symbol/earnings - Earnings history + next earnings date
router.get('/:symbol/earnings', async (req, res) => {
  try {
    const { symbol } = req.params;
    const data = await cachedCall(
      `ticker:earnings:${symbol}`,
      60 * 60 * 1000, // 1 hour
      async () => {
        const summary = await yf.quoteSummary(symbol, {
          modules: ['earningsHistory', 'earnings', 'calendarEvents'] as any,
        });

        const n = (v: any): number | undefined => {
          if (typeof v === 'number' && isFinite(v)) return v;
          if (v && typeof v.raw === 'number' && isFinite(v.raw)) return v.raw;
          return undefined;
        };

        // "1Q2025" → "Q1 '25"
        const fmtPeriod = (s: string): string => {
          const m = s.match(/^(\d)Q(\d{4})$/);
          return m ? `Q${m[1]} '${m[2].slice(2)}` : s;
        };

        // Handles Date objects (yahoo-finance2 zod), ISO strings, and Unix timestamps
        const tsToDate = (ts: any): string | undefined => {
          if (ts instanceof Date) return ts.toISOString().split('T')[0];
          if (typeof ts === 'string' && ts.includes('T')) return ts.split('T')[0];
          if (typeof ts === 'string') return ts;
          const raw = typeof ts === 'number' ? ts : n(ts);
          if (!raw) return undefined;
          return new Date(raw * 1000).toISOString().split('T')[0];
        };

        const toDate = (ts: any): Date | undefined => {
          if (ts instanceof Date) return ts;
          if (typeof ts === 'string') return new Date(ts);
          const raw = typeof ts === 'number' ? ts : n(ts);
          return raw ? new Date(raw * 1000) : undefined;
        };

        // earningsChart.quarterly: {date:"1Q2025", actual, estimate, surprisePct:"1.69"}
        const ecq: any[] = (summary as any).earnings?.earningsChart?.quarterly   ?? [];
        // financialsChart.quarterly: {date:"1Q2025", revenue, earnings}
        const fcq: any[] = (summary as any).earnings?.financialsChart?.quarterly ?? [];
        const echart: any = (summary as any).earnings?.earningsChart ?? {};
        const cal: any    = (summary as any).calendarEvents?.earnings ?? {};

        // Next earnings date
        const dateSources = cal.earningsDate ?? echart.earningsDate ?? [];
        const nextEarningsDate    = tsToDate(dateSources[0]);
        const nextEarningsDateEnd = tsToDate(dateSources[1]);

        // Derive call time from the datetime if no explicit field
        // UTC hour: <14 = BMO (before ~9:30 AM ET), >=18 = AMC (after ~2 PM ET)
        const earningsCallTime = (() => {
          const rawCallTime = cal.earningsCallTime;
          if (typeof rawCallTime === 'string') return rawCallTime;
          if (rawCallTime?.fmt || rawCallTime?.raw) return rawCallTime.fmt ?? rawCallTime.raw;
          const dt = toDate(dateSources[0]);
          if (!dt) return undefined;
          const h = dt.getUTCHours();
          if (h < 14) return 'bmo';
          if (h >= 18) return 'amc';
          return 'dmh';
        })();

        // Analyst EPS + revenue estimates
        const epsAvg = n(cal.earningsAverage);
        const epsEstimate = epsAvg != null ? {
          avg:  epsAvg,
          low:  n(cal.earningsLow)  ?? epsAvg,
          high: n(cal.earningsHigh) ?? epsAvg,
        } : undefined;

        const revAvg = n(cal.revenueAverage);
        const revenueEstimate = revAvg != null ? {
          avg:  revAvg,
          low:  n(cal.revenueLow)  ?? revAvg,
          high: n(cal.revenueHigh) ?? revAvg,
        } : undefined;

        // Revenue keyed by the same date string used in earningsChart ("1Q2025")
        const revenueByDate: Record<string, number> = {};
        for (const q of fcq) {
          const key = typeof q.date === 'string' ? q.date : '';
          const rev = n(q.revenue);
          if (key && rev != null) revenueByDate[key] = rev;
        }

        // Build quarters from earningsChart (date, actual, estimate, surprisePct all present)
        const quarters = ecq
          .map((q: any) => {
            const dateKey     = typeof q.date === 'string' ? q.date : '';
            const epsActual   = n(q.actual);
            const epsEstimate = n(q.estimate);
            // surprisePct arrives as a percentage string e.g. "1.69"
            const epsSurprisePct =
              typeof q.surprisePct === 'string' ? parseFloat(q.surprisePct)
              : n(q.surprisePct);
            return {
              period:        fmtPeriod(dateKey),
              epsActual,
              epsEstimate,
              epsSurprisePct,
              revenueActual: revenueByDate[dateKey],
            };
          })
          .filter((q: any) => q.period && q.epsActual != null)
          .reverse(); // chronological: oldest left, newest right

        return { symbol, nextEarningsDate, nextEarningsDateEnd, earningsCallTime, epsEstimate, revenueEstimate, quarters };
      },
    );
    res.json(data);
  } catch (err: any) {
    console.error('Earnings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch earnings data' });
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
