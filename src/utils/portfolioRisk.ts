// Pure risk-metric functions for the Portfolio Analysis card.
// No React, no I/O. Inputs: positions, quotes, history (incl. SPY), lookback.
// Cash is deliberately excluded from all metrics — holdings-only by design.

import type { PortfolioPosition } from './portfolioStorage';
import type { PriceBar } from '../api/types';

export type LookbackId = '1y' | '2y' | '5y';

export const LOOKBACK_DAYS: Record<LookbackId, number> = {
  '1y':  252,
  '2y':  504,
  '5y':  1260,
};

export interface RiskInputs {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
  historyBySymbol: Record<string, PriceBar[] | undefined>;
  spyHistory: PriceBar[] | undefined;
  lookback: LookbackId;
}

export interface BetaBand {
  label: 'Defensive' | 'Balanced' | 'Aggressive';
  color: string; // CSS var name
}

export interface PortfolioRiskMetrics {
  beta: number | null;
  betaBand: BetaBand | null;
  volatility: number | null;       // annualized stdev of daily returns, fraction (0.18 = 18%)
  maxDrawdown: number | null;      // negative fraction, -0.32 = -32%
  maxDrawdownPeak: string | null;  // ISO date
  maxDrawdownTrough: string | null;
  includedSymbols: string[];
  excludedSymbols: string[];       // symbols dropped from analysis (no/insufficient history)
  observationDays: number;         // how many aligned bars we ended up with
  effectiveLookback: LookbackId;   // echo back for the UI
}

export interface CorrelationCell {
  symA: string;
  symB: string;
  corr: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];     // matrix[i][j] = corr(symbols[i], symbols[j]); diag = 1
  avgPairwise: number;    // mean of off-diagonal entries (i < j)
  highestPair: CorrelationCell | null;
  lowestPair:  CorrelationCell | null;
}

// ── Math helpers ─────────────────────────────────────────────────────────

function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      out.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return out;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

function covariance(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s / (n - 1);
}

function pearson(xs: number[], ys: number[]): number {
  const cov = covariance(xs, ys);
  const sx = Math.sqrt(variance(xs));
  const sy = Math.sqrt(variance(ys));
  if (sx === 0 || sy === 0) return 0;
  return cov / (sx * sy);
}

// ── Date-aligned price matrix ────────────────────────────────────────────

interface AlignedHistory {
  dates: string[];                            // ISO 'YYYY-MM-DD' per row
  priceBySymbol: Record<string, number[]>;    // each array same length as dates
  symbols: string[];                          // included symbols (intersection-aligned)
}

/**
 * Build an aligned price matrix across symbols. The aligned date set is the
 * intersection of trading days across every included symbol *plus SPY* if
 * present. Symbols with fewer than `minBars` aligned bars are dropped and
 * surfaced as excluded.
 *
 * SPY (if provided) participates in the intersection so beta computations
 * later use the same date set.
 */
function alignHistory(
  positionSymbols: string[],
  historyBySymbol: Record<string, PriceBar[] | undefined>,
  spyHistory: PriceBar[] | undefined,
  lookbackDays: number,
  minBars: number,
): { aligned: AlignedHistory; excluded: string[]; spyPrices: number[] | null } {
  const dateToPriceBySym: Record<string, Map<string, number>> = {};
  const eligibleSymbols: string[] = [];
  const excluded: string[] = [];

  for (const sym of positionSymbols) {
    const bars = historyBySymbol[sym];
    if (!bars || bars.length < minBars) {
      excluded.push(sym);
      continue;
    }
    const map = new Map<string, number>();
    const tail = bars.slice(-Math.max(lookbackDays, minBars) * 2); // window + headroom for align loss
    for (const b of tail) {
      if (typeof b.close === 'number' && b.close > 0) {
        map.set(b.date.slice(0, 10), b.close);
      }
    }
    if (map.size < minBars) {
      excluded.push(sym);
      continue;
    }
    dateToPriceBySym[sym] = map;
    eligibleSymbols.push(sym);
  }

  let spyMap: Map<string, number> | null = null;
  if (spyHistory && spyHistory.length >= minBars) {
    spyMap = new Map<string, number>();
    const tail = spyHistory.slice(-Math.max(lookbackDays, minBars) * 2);
    for (const b of tail) {
      if (typeof b.close === 'number' && b.close > 0) {
        spyMap.set(b.date.slice(0, 10), b.close);
      }
    }
  }

  if (eligibleSymbols.length === 0) {
    return {
      aligned: { dates: [], priceBySymbol: {}, symbols: [] },
      excluded,
      spyPrices: null,
    };
  }

  // Intersection of date sets across all eligible symbols (and SPY if present).
  const firstMap = dateToPriceBySym[eligibleSymbols[0]];
  const intersect: string[] = [];
  for (const date of firstMap.keys()) {
    let inAll = true;
    for (let i = 1; i < eligibleSymbols.length; i++) {
      if (!dateToPriceBySym[eligibleSymbols[i]].has(date)) { inAll = false; break; }
    }
    if (inAll && spyMap && !spyMap.has(date)) inAll = false;
    if (inAll) intersect.push(date);
  }
  intersect.sort();

  // Apply lookback cap from the most recent end.
  const dates = intersect.slice(-lookbackDays);

  const priceBySymbol: Record<string, number[]> = {};
  for (const sym of eligibleSymbols) {
    priceBySymbol[sym] = dates.map(d => dateToPriceBySym[sym].get(d)!);
  }

  const spyPrices = spyMap ? dates.map(d => spyMap!.get(d)!) : null;

  return {
    aligned: { dates, priceBySymbol, symbols: eligibleSymbols },
    excluded,
    spyPrices,
  };
}

// ── Headline metrics ─────────────────────────────────────────────────────

export function bandForBeta(beta: number): BetaBand {
  if (beta < 0.8)  return { label: 'Defensive',  color: 'var(--color-green)' };
  if (beta > 1.2)  return { label: 'Aggressive', color: 'var(--color-red)' };
  return            { label: 'Balanced',   color: 'var(--color-yellow)' };
}

export function computePortfolioRisk(inputs: RiskInputs): PortfolioRiskMetrics {
  const lookbackDays = LOOKBACK_DAYS[inputs.lookback];
  const minBars = Math.max(30, Math.floor(lookbackDays * 0.3));

  // Only positions with a current price (so we can weight them).
  const pricedPositions = inputs.positions.filter(p => {
    const px = inputs.priceBySymbol[p.symbol];
    return typeof px === 'number' && isFinite(px) && px > 0;
  });

  const positionSymbols = pricedPositions.map(p => p.symbol);
  const { aligned, excluded, spyPrices } = alignHistory(
    positionSymbols,
    inputs.historyBySymbol,
    inputs.spyHistory,
    lookbackDays,
    minBars,
  );

  const includedSymbols = aligned.symbols;

  if (includedSymbols.length === 0 || aligned.dates.length < 2) {
    return {
      beta: null,
      betaBand: null,
      volatility: null,
      maxDrawdown: null,
      maxDrawdownPeak: null,
      maxDrawdownTrough: null,
      includedSymbols: [],
      excludedSymbols: excluded,
      observationDays: aligned.dates.length,
      effectiveLookback: inputs.lookback,
    };
  }

  // Current shares & market-value weights (cash excluded by design).
  const sharesBySym: Record<string, number> = {};
  for (const p of pricedPositions) sharesBySym[p.symbol] = p.shares;

  // Portfolio NAV at each aligned bar — using *current* shares.
  const nav: number[] = aligned.dates.map((_, t) => {
    let v = 0;
    for (const sym of includedSymbols) {
      v += sharesBySym[sym] * aligned.priceBySymbol[sym][t];
    }
    return v;
  });

  // Daily log returns of the NAV series.
  const navReturns = logReturns(nav);
  const vol = navReturns.length >= 2 ? Math.sqrt(variance(navReturns)) * Math.sqrt(252) : null;

  // Max drawdown on the NAV series.
  let mdd = 0;
  let peakIdx = 0;
  let troughIdx = 0;
  let runningPeak = nav[0];
  let runningPeakIdx = 0;
  for (let i = 1; i < nav.length; i++) {
    if (nav[i] > runningPeak) {
      runningPeak = nav[i];
      runningPeakIdx = i;
    } else {
      const dd = nav[i] / runningPeak - 1;
      if (dd < mdd) {
        mdd = dd;
        peakIdx = runningPeakIdx;
        troughIdx = i;
      }
    }
  }
  const maxDrawdown = nav.length >= 2 ? mdd : null;

  // Beta via NAV regression against SPY (equivalent to weighted-average of per-symbol betas).
  let beta: number | null = null;
  if (spyPrices && spyPrices.length === nav.length) {
    const spyReturns = logReturns(spyPrices);
    if (spyReturns.length === navReturns.length && spyReturns.length >= 2) {
      const varM = variance(spyReturns);
      beta = varM > 0 ? covariance(navReturns, spyReturns) / varM : null;
    }
  }

  return {
    beta,
    betaBand: beta != null ? bandForBeta(beta) : null,
    volatility: vol,
    maxDrawdown,
    maxDrawdownPeak: maxDrawdown != null ? aligned.dates[peakIdx] : null,
    maxDrawdownTrough: maxDrawdown != null ? aligned.dates[troughIdx] : null,
    includedSymbols,
    excludedSymbols: excluded,
    observationDays: aligned.dates.length,
    effectiveLookback: inputs.lookback,
  };
}

// ── Correlation matrix ───────────────────────────────────────────────────

export function computeCorrelationMatrix(inputs: RiskInputs): CorrelationMatrix {
  const lookbackDays = LOOKBACK_DAYS[inputs.lookback];
  const minBars = Math.max(30, Math.floor(lookbackDays * 0.3));

  const pricedPositions = inputs.positions.filter(p => {
    const px = inputs.priceBySymbol[p.symbol];
    return typeof px === 'number' && isFinite(px) && px > 0;
  });

  const { aligned } = alignHistory(
    pricedPositions.map(p => p.symbol),
    inputs.historyBySymbol,
    undefined, // SPY not needed for correlation
    lookbackDays,
    minBars,
  );

  const symbols = aligned.symbols;
  if (symbols.length < 2) {
    return { symbols, matrix: symbols.map(() => [1]), avgPairwise: 0, highestPair: null, lowestPair: null };
  }

  const returnsBySym: Record<string, number[]> = {};
  for (const sym of symbols) {
    returnsBySym[sym] = logReturns(aligned.priceBySymbol[sym]);
  }

  const matrix: number[][] = symbols.map(() => new Array(symbols.length).fill(0));
  let sumOffDiag = 0;
  let countOffDiag = 0;
  let highest: CorrelationCell | null = null;
  let lowest: CorrelationCell | null = null;

  for (let i = 0; i < symbols.length; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < symbols.length; j++) {
      const c = pearson(returnsBySym[symbols[i]], returnsBySym[symbols[j]]);
      matrix[i][j] = c;
      matrix[j][i] = c;
      sumOffDiag += c;
      countOffDiag += 1;
      const cell: CorrelationCell = { symA: symbols[i], symB: symbols[j], corr: c };
      if (!highest || c > highest.corr) highest = cell;
      if (!lowest  || c < lowest.corr)  lowest  = cell;
    }
  }

  return {
    symbols,
    matrix,
    avgPairwise: countOffDiag > 0 ? sumOffDiag / countOffDiag : 0,
    highestPair: highest,
    lowestPair: lowest,
  };
}
