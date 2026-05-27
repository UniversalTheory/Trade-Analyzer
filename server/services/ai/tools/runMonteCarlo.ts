import { getProvider, cachedCall, TTLCache } from '../../providerRegistry.js';
import type { Tool } from './types.js';

const STRATEGY_ENUM = [
  'long_call',
  'long_put',
  'covered_call',
  'cash_secured_put',
  'put_credit_spread',
  'bull_call_spread',
] as const;
type StrategyId = typeof STRATEGY_ENUM[number];

// ── PRNG + Box-Muller (inlined, mirrors src/utils/prng.ts) ──
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNormal(rand: () => number): () => number {
  let spare: number | null = null;
  return function () {
    if (spare !== null) {
      const v = spare; spare = null; return v;
    }
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = rand();
    while (u2 === 0) u2 = rand();
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    spare = mag * Math.sin(2 * Math.PI * u2);
    return z0;
  };
}

// ── Black-Scholes (for premium estimation) ──
function cdf(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const y = 1 - poly * Math.exp(-absX * absX / 2) / Math.sqrt(2 * Math.PI);
  return 0.5 * (1 + sign * y);
}
function bsPrice(S: number, K: number, T: number, r: number, sigma: number, type: 'call' | 'put'): number {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (type === 'call') return S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
  return K * Math.exp(-r * T) * cdf(-d2) - S * cdf(-d1);
}

// ── Vol estimate from closes ──
function annualizedRealizedVol(closes: number[]): number {
  if (closes.length < 30) return 0.3;
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < 30) return 0.3;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((acc, r) => acc + (r - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function quantile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return 0;
  const pos = Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))));
  return sorted[pos];
}

interface LegDef {
  type: 'call' | 'put';
  strike: number;
  premium: number;     // per-share
  side: 'long' | 'short';
}

interface StrategyDef {
  legs: LegDef[];
  stockBasis?: number; // for covered call
  description: string;
  primaryStrike: number;
}

function buildStrategy(
  strategy: StrategyId,
  S: number,
  T: number,
  sigma: number,
  r: number,
  strikePercent: number,
  widthPercent: number,
): StrategyDef {
  // Round strikes to whole dollars for sub-$200 and to nearest 5 above
  const round = (k: number) => S < 50 ? Math.round(k * 2) / 2 : S < 200 ? Math.round(k) : Math.round(k / 5) * 5;
  const Kprimary = round(S * (1 + strikePercent / 100));

  switch (strategy) {
    case 'long_call': {
      const prem = bsPrice(S, Kprimary, T, r, sigma, 'call');
      return {
        primaryStrike: Kprimary,
        description: `Long ${Kprimary} call @ $${prem.toFixed(2)}`,
        legs: [{ type: 'call', strike: Kprimary, premium: prem, side: 'long' }],
      };
    }
    case 'long_put': {
      const prem = bsPrice(S, Kprimary, T, r, sigma, 'put');
      return {
        primaryStrike: Kprimary,
        description: `Long ${Kprimary} put @ $${prem.toFixed(2)}`,
        legs: [{ type: 'put', strike: Kprimary, premium: prem, side: 'long' }],
      };
    }
    case 'covered_call': {
      const prem = bsPrice(S, Kprimary, T, r, sigma, 'call');
      return {
        primaryStrike: Kprimary,
        description: `Long stock @ $${S.toFixed(2)} basis + short ${Kprimary} call @ $${prem.toFixed(2)}`,
        legs: [{ type: 'call', strike: Kprimary, premium: prem, side: 'short' }],
        stockBasis: S,
      };
    }
    case 'cash_secured_put': {
      const prem = bsPrice(S, Kprimary, T, r, sigma, 'put');
      return {
        primaryStrike: Kprimary,
        description: `Short ${Kprimary} put @ $${prem.toFixed(2)}`,
        legs: [{ type: 'put', strike: Kprimary, premium: prem, side: 'short' }],
      };
    }
    case 'put_credit_spread': {
      // Short higher put (closer to ATM), long lower put (further OTM)
      const Kshort = Kprimary;
      const Klong = round(Kprimary * (1 - widthPercent / 100));
      const premShort = bsPrice(S, Kshort, T, r, sigma, 'put');
      const premLong = bsPrice(S, Klong, T, r, sigma, 'put');
      return {
        primaryStrike: Kshort,
        description: `Short ${Kshort} put / long ${Klong} put`,
        legs: [
          { type: 'put', strike: Kshort, premium: premShort, side: 'short' },
          { type: 'put', strike: Klong,  premium: premLong,  side: 'long'  },
        ],
      };
    }
    case 'bull_call_spread': {
      // Long lower call (closer to ATM), short higher call
      const Klong = Kprimary;
      const Kshort = round(Kprimary * (1 + widthPercent / 100));
      const premLong = bsPrice(S, Klong, T, r, sigma, 'call');
      const premShort = bsPrice(S, Kshort, T, r, sigma, 'call');
      return {
        primaryStrike: Klong,
        description: `Long ${Klong} call / short ${Kshort} call`,
        legs: [
          { type: 'call', strike: Klong,  premium: premLong,  side: 'long'  },
          { type: 'call', strike: Kshort, premium: premShort, side: 'short' },
        ],
      };
    }
  }
}

function payoffAtTerminal(spec: StrategyDef, S0: number, ST: number): number {
  let pl = 0;
  for (const leg of spec.legs) {
    const intrinsic = leg.type === 'call' ? Math.max(ST - leg.strike, 0) : Math.max(leg.strike - ST, 0);
    if (leg.side === 'long') pl += intrinsic - leg.premium;
    else                     pl += leg.premium - intrinsic;
  }
  if (spec.stockBasis != null) {
    pl += ST - spec.stockBasis;
  }
  return pl;
}

export const runMonteCarlo: Tool = {
  def: {
    name: 'runMonteCarlo',
    description:
      'Run a 10K-path Monte Carlo (geometric Brownian motion) for an option strategy on a single symbol. ' +
      'Uses trailing 1-year realized volatility as the vol input and Black-Scholes for premium estimates. ' +
      'Returns probability of profit (POP), expected value per share, percentile P/L (p25/p50/p75), ' +
      'max loss / max gain (from simulated paths), and the strikes & premiums used. ' +
      'Use this for "what\'s the POP for X strategy at Y strike with Z days to expiry?" type questions. ' +
      'Multiply per-share numbers by 100 for per-contract.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Ticker symbol, e.g. NVDA, SPY.',
        },
        strategy: {
          type: 'string',
          enum: [...STRATEGY_ENUM],
          description:
            'Strategy id. long_call/long_put: single long option. covered_call: long stock + short OTM call. ' +
            'cash_secured_put: short OTM put. put_credit_spread: short put + long further-OTM put. ' +
            'bull_call_spread: long call + short higher call.',
        },
        dteDays: {
          type: 'number',
          description: 'Days to expiry (calendar). 1-180.',
        },
        strikePercent: {
          type: 'number',
          description:
            'Primary strike offset from spot, in percent. 0 = ATM, +5 = 5% OTM call / 5% above spot, ' +
            '-5 = 5% OTM put / 5% below spot. For directional strategies, sign matters; pick the side ' +
            'that matches the strategy bias (positive for calls, negative for puts).',
        },
        widthPercent: {
          type: 'number',
          description:
            'Optional spread width as percent of spot, for put_credit_spread and bull_call_spread. ' +
            'Default 5. Ignored for single-leg strategies.',
        },
      },
      required: ['symbol', 'strategy', 'dteDays', 'strikePercent'],
    },
  },
  async handler(input) {
    const symbol = String(input.symbol ?? '').trim().toUpperCase();
    const strategy = String(input.strategy ?? '') as StrategyId;
    const dteDays = Number(input.dteDays);
    const strikePercent = Number(input.strikePercent);
    const widthPercent = Number.isFinite(Number(input.widthPercent)) ? Number(input.widthPercent) : 5;

    if (!symbol) return { error: 'symbol is required' };
    if (!(STRATEGY_ENUM as readonly string[]).includes(strategy)) {
      return { error: `strategy must be one of: ${STRATEGY_ENUM.join(', ')}` };
    }
    if (!Number.isFinite(dteDays) || dteDays < 1 || dteDays > 180) {
      return { error: 'dteDays must be between 1 and 180' };
    }
    if (!Number.isFinite(strikePercent) || Math.abs(strikePercent) > 50) {
      return { error: 'strikePercent must be between -50 and 50' };
    }

    const provider = getProvider('quote');
    const histProvider = getProvider('history');

    const [quote, bars] = await Promise.all([
      cachedCall(`ticker:quote:${symbol}`, TTLCache.TTL.QUOTE, () => provider.getQuote(symbol)),
      cachedCall(`ticker:history:${symbol}:1y:1d`, TTLCache.TTL.HISTORY, () => histProvider.getHistoricalPrices(symbol, '1y', '1d')),
    ]);

    const S0 = quote.price;
    if (!(S0 > 0)) return { error: `no live quote for ${symbol}` };

    const closes = bars.map(b => b.close).filter(x => x > 0);
    const sigma = annualizedRealizedVol(closes);
    const T = dteDays / 365;
    const r = 0.045; // approximate risk-free rate

    const spec = buildStrategy(strategy, S0, T, sigma, r, strikePercent, widthPercent);

    // 10K-path terminal GBM
    const paths = 10000;
    const rand = mulberry32(Math.floor(Date.now() % 2 ** 31));
    const norm = makeNormal(rand);
    const drift = (r - 0.5 * sigma * sigma) * T;
    const diffusion = sigma * Math.sqrt(T);

    const payoffs = new Float64Array(paths);
    let wins = 0;
    let totalPL = 0;
    for (let i = 0; i < paths; i++) {
      const ST = S0 * Math.exp(drift + diffusion * norm());
      const pl = payoffAtTerminal(spec, S0, ST);
      payoffs[i] = pl;
      totalPL += pl;
      if (pl > 0) wins++;
    }

    const sorted = payoffs.slice().sort();
    const ev = totalPL / paths;
    const pop = wins / paths;
    const p05 = quantile(sorted, 0.05);
    const p25 = quantile(sorted, 0.25);
    const p50 = quantile(sorted, 0.50);
    const p75 = quantile(sorted, 0.75);
    const p95 = quantile(sorted, 0.95);

    let verdict: string;
    if (pop > 0.70 && ev > 0) verdict = 'favorable (high POP, positive EV)';
    else if (pop > 0.55 && ev > 0) verdict = 'reasonable (moderate POP, positive EV)';
    else if (ev > 0) verdict = 'speculative (low POP but positive EV)';
    else if (pop > 0.55) verdict = 'cap-limited (decent POP but negative EV — fat-tailed losses)';
    else verdict = 'unfavorable (low POP, negative EV)';

    return {
      symbol,
      strategy,
      dteDays,
      strikePercent,
      widthPercent: ['put_credit_spread', 'bull_call_spread'].includes(strategy) ? widthPercent : null,
      spot: Number(S0.toFixed(2)),
      impliedVolUsed: Number(sigma.toFixed(3)),
      strategyDescription: spec.description,
      primaryStrike: spec.primaryStrike,
      legs: spec.legs.map(l => ({
        side: l.side,
        type: l.type,
        strike: l.strike,
        premium: Number(l.premium.toFixed(2)),
      })),
      results: {
        popPercent: Number((pop * 100).toFixed(1)),
        expectedValuePerShare: Number(ev.toFixed(2)),
        expectedValuePerContract: Number((ev * 100).toFixed(2)),
        p05PerShare: Number(p05.toFixed(2)),
        p25PerShare: Number(p25.toFixed(2)),
        medianPerShare: Number(p50.toFixed(2)),
        p75PerShare: Number(p75.toFixed(2)),
        p95PerShare: Number(p95.toFixed(2)),
        worstPerShare: Number(sorted[0].toFixed(2)),
        bestPerShare: Number(sorted[sorted.length - 1].toFixed(2)),
      },
      paths,
      verdict,
      notes:
        'Vol estimate is 1-year trailing realized vol (not implied vol). ' +
        'Premiums are theoretical Black-Scholes prices at that vol — actual market premiums may differ.',
    };
  },
};
