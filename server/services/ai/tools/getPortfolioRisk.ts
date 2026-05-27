import { getProvider, cachedCall, TTLCache } from '../../providerRegistry.js';
import YahooFinance from 'yahoo-finance2';
import type { Tool, ChatPortfolioSnapshot } from './types.js';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const STATIC_SECTOR_OVERRIDES: Record<string, string> = {
  SPY: 'ETF/Broad', QQQ: 'ETF/Tech', IWM: 'ETF/Small Cap',
  DIA: 'ETF/Broad', VTI: 'ETF/Broad', VOO: 'ETF/Broad',
  XLK: 'Technology', XLF: 'Financial Services', XLE: 'Energy',
  XLV: 'Healthcare', XLY: 'Consumer Cyclical', XLP: 'Consumer Defensive',
  XLI: 'Industrials', XLU: 'Utilities', XLB: 'Basic Materials',
  XLRE: 'Real Estate', XLC: 'Communication Services',
  GLD: 'Commodity/Metals', SLV: 'Commodity/Metals', USO: 'Commodity/Energy',
  TLT: 'Bonds/Long', IEF: 'Bonds/Mid', SHY: 'Bonds/Short',
  AGG: 'Bonds/Broad', BND: 'Bonds/Broad', HYG: 'Bonds/High Yield',
};

interface PositionLine {
  symbol: string;
  shares: number;
  avgPrice: number;
  price: number;
  marketValue: number;
  weight: number;
  pl: number;
  plPct: number;
  sector: string | null;
}

async function loadSector(symbol: string): Promise<string | null> {
  const override = STATIC_SECTOR_OVERRIDES[symbol];
  if (override) return override;
  try {
    const summary = await cachedCall(
      `ticker:profile:${symbol}`,
      TTLCache.TTL.SEARCH,
      () => yf.quoteSummary(symbol, { modules: ['assetProfile', 'summaryProfile'] as never }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = summary as any;
    const sector = s.assetProfile?.sector ?? s.summaryProfile?.sector ?? null;
    return sector ?? null;
  } catch {
    return null;
  }
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = a.slice(-n);
  const mb = b.slice(-n);
  const meanA = ma.reduce((x, y) => x + y, 0) / n;
  const meanB = mb.reduce((x, y) => x + y, 0) / n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = ma[i] - meanA;
    const db = mb[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      out.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return out;
}

function annualizedVol(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

async function getQuotes(symbols: string[]): Promise<Record<string, number>> {
  const provider = getProvider('quote');
  const out: Record<string, number> = {};
  await Promise.all(symbols.map(async (sym) => {
    try {
      const q = await cachedCall(`ticker:quote:${sym}`, TTLCache.TTL.QUOTE, () => provider.getQuote(sym));
      out[sym] = q.price;
    } catch {
      // skip
    }
  }));
  return out;
}

async function getCloses(symbol: string, range = '1y'): Promise<number[]> {
  const provider = getProvider('history');
  try {
    const bars = await cachedCall(
      `ticker:history:${symbol}:${range}:1d`,
      TTLCache.TTL.HISTORY,
      () => provider.getHistoricalPrices(symbol, range, '1d'),
    );
    return bars.map(b => b.close).filter(x => x > 0);
  } catch {
    return [];
  }
}

export const getPortfolioRisk: Tool = {
  def: {
    name: 'getPortfolioRisk',
    description:
      'Analyze the user\'s current portfolio: composition, concentration, sector mix, beta vs SPY, ' +
      'annualized volatility, and pairwise correlations between holdings. Returns per-position rows with ' +
      'weight + P/L, sector buckets with weights, concentration metrics (HHI, top-3 weight), beta band, ' +
      'and the highest/lowest correlation pairs. Use this whenever the user asks about their portfolio ' +
      '("am I diversified?", "what\'s my biggest risk?", "tech-heavy?"). Returns empty result if the user ' +
      'has no portfolio set up.',
    input_schema: {
      type: 'object',
      properties: {
        lookback: {
          type: 'string',
          enum: ['1y', '2y', '5y'],
          description: 'Lookback window for risk metrics (default 1y).',
        },
      },
      required: [],
    },
  },
  async handler(input, ctx) {
    const lookback = (typeof input.lookback === 'string' && ['1y', '2y', '5y'].includes(input.lookback))
      ? input.lookback as '1y' | '2y' | '5y'
      : '1y';

    const port: ChatPortfolioSnapshot | undefined = ctx.portfolio;
    if (!port || !port.positions || port.positions.length === 0) {
      return {
        empty: true,
        message: 'User has no positions in portfolio.',
        cash: port?.cash ?? 0,
      };
    }

    const symbols = port.positions.map(p => p.symbol);
    const prices = await getQuotes(symbols);

    const lines: PositionLine[] = [];
    let holdingsTotal = 0;
    for (const p of port.positions) {
      const price = prices[p.symbol];
      if (!price) continue;
      const marketValue = price * p.shares;
      const costBasis = p.avgPrice * p.shares;
      holdingsTotal += marketValue;
      lines.push({
        symbol: p.symbol,
        shares: p.shares,
        avgPrice: p.avgPrice,
        price,
        marketValue,
        weight: 0,
        pl: marketValue - costBasis,
        plPct: costBasis > 0 ? (marketValue - costBasis) / costBasis : 0,
        sector: null,
      });
    }
    for (const ln of lines) {
      ln.weight = holdingsTotal > 0 ? ln.marketValue / holdingsTotal : 0;
    }
    lines.sort((a, b) => b.weight - a.weight);

    // Sector lookups
    await Promise.all(lines.map(async ln => {
      ln.sector = await loadSector(ln.symbol);
    }));

    const sectorWeights: Record<string, number> = {};
    for (const ln of lines) {
      const key = ln.sector ?? 'Unknown';
      sectorWeights[key] = (sectorWeights[key] ?? 0) + ln.weight;
    }
    const sectorMix = Object.entries(sectorWeights)
      .map(([sector, weight]) => ({ sector, weight: Number(weight.toFixed(3)) }))
      .sort((a, b) => b.weight - a.weight);

    const hhi = lines.reduce((acc, ln) => acc + ln.weight * ln.weight, 0);
    const topWeight = lines[0]?.weight ?? 0;
    const top3 = lines.slice(0, 3).reduce((acc, ln) => acc + ln.weight, 0);

    // Risk metrics — beta vs SPY + vol, using log-returns over the lookback.
    const range = lookback;
    const [spyCloses, ...allCloses] = await Promise.all([
      getCloses('SPY', range),
      ...lines.map(ln => getCloses(ln.symbol, range)),
    ]);

    const spyReturns = logReturns(spyCloses);
    const portReturns: number[] = [];
    const allReturns: number[][] = [];
    const minBars = spyReturns.length;
    for (let i = 0; i < lines.length; i++) {
      const rs = logReturns(allCloses[i]).slice(-minBars);
      allReturns.push(rs);
    }
    // Portfolio daily log return = weighted sum of position log returns
    const useLen = Math.min(spyReturns.length, ...allReturns.map(r => r.length));
    if (useLen >= 30) {
      for (let i = 0; i < useLen; i++) {
        let r = 0;
        for (let j = 0; j < lines.length; j++) {
          const rj = allReturns[j].slice(-useLen)[i] ?? 0;
          r += lines[j].weight * rj;
        }
        portReturns.push(r);
      }
    }

    let beta: number | null = null;
    if (portReturns.length >= 30) {
      const spyAligned = spyReturns.slice(-portReturns.length);
      const meanSpy = spyAligned.reduce((a, b) => a + b, 0) / spyAligned.length;
      const meanPort = portReturns.reduce((a, b) => a + b, 0) / portReturns.length;
      let cov = 0, varSpy = 0;
      for (let i = 0; i < portReturns.length; i++) {
        cov += (portReturns[i] - meanPort) * (spyAligned[i] - meanSpy);
        varSpy += (spyAligned[i] - meanSpy) ** 2;
      }
      beta = varSpy > 0 ? cov / varSpy : null;
    }
    const volatility = portReturns.length >= 30 ? annualizedVol(portReturns) : null;

    let highestPair: { a: string; b: string; corr: number } | null = null;
    let lowestPair: { a: string; b: string; corr: number } | null = null;
    if (lines.length >= 2 && useLen >= 30) {
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
          const corr = pearson(allReturns[i].slice(-useLen), allReturns[j].slice(-useLen));
          if (!highestPair || corr > highestPair.corr) {
            highestPair = { a: lines[i].symbol, b: lines[j].symbol, corr: Number(corr.toFixed(2)) };
          }
          if (!lowestPair || corr < lowestPair.corr) {
            lowestPair = { a: lines[i].symbol, b: lines[j].symbol, corr: Number(corr.toFixed(2)) };
          }
        }
      }
    }

    return {
      empty: false,
      lookback,
      holdingsTotal: Number(holdingsTotal.toFixed(2)),
      cash: port.cash,
      totalPortfolio: Number((holdingsTotal + port.cash).toFixed(2)),
      positions: lines.map(ln => ({
        symbol: ln.symbol,
        shares: ln.shares,
        price: Number(ln.price.toFixed(2)),
        marketValue: Number(ln.marketValue.toFixed(2)),
        weight: Number(ln.weight.toFixed(3)),
        pl: Number(ln.pl.toFixed(2)),
        plPct: Number(ln.plPct.toFixed(3)),
        sector: ln.sector,
      })),
      sectorMix,
      concentration: {
        positionCount: lines.length,
        topWeight: Number(topWeight.toFixed(3)),
        top3Weight: Number(top3.toFixed(3)),
        hhi: Number(hhi.toFixed(3)),
        hhiBand: hhi > 0.4 ? 'high' : hhi > 0.2 ? 'moderate' : 'low',
      },
      risk: {
        beta: beta == null ? null : Number(beta.toFixed(2)),
        betaBand:
          beta == null ? null :
          beta < 0.8 ? 'Defensive' :
          beta <= 1.2 ? 'Balanced' : 'Aggressive',
        volatility: volatility == null ? null : Number(volatility.toFixed(3)),
        observationDays: portReturns.length,
      },
      correlationExtremes: {
        highestPair,
        lowestPair,
      },
    };
  },
};
