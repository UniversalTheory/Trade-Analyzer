/**
 * Historical backtest engine for option strategies.
 *
 * For each rolling-window entry across the supplied price history:
 *   1. Compute trailing realized vol from prior N trading-day log-returns.
 *   2. Select canonical strikes via `selectStrikes` using that trailing vol
 *      (so BS-priced premiums reflect the vol environment at entry).
 *   3. Find the exit bar at entry_date + DTE calendar days.
 *   4. Compute realized per-share P/L via `payoffAtExpiry` at the exit close.
 *   5. Run a small terminal-GBM MC at entry to record the predicted POP —
 *      the "hybrid 1c" piece that lets us measure model calibration.
 *
 * The engine is strategy-agnostic; callers can run a single strategy or
 * iterate `STRATEGIES` to compare all of them across the same window set.
 *
 * All P/L values are per share (multiply by 100 for per-contract dollars).
 */

import {
  payoffAtExpiry, payoffVector, supportsMonteCarloPayoff,
  type StrategyId,
} from './strategyPayoff';
import { selectStrikes } from './strikeSelector';
import { simulateTerminalGBM, computeLogReturns, annualisedVol } from './monteCarlo';

export type Cadence = 'daily' | 'weekly' | 'monthly';

export const CADENCE_STEP_TRADING_DAYS: Record<Cadence, number> = {
  daily:   1,
  weekly:  5,
  monthly: 21,
};

export interface PriceBarLite {
  date: string;   // ISO date string
  close: number;
}

export interface BacktestParams {
  bars: PriceBarLite[];        // date-sorted ascending; daily interval expected
  strategy: StrategyId;
  dteDays: number;             // calendar days from entry to expiry
  cadence: Cadence;
  volLookbackBars?: number;    // trailing trading days for realized vol (default 30)
  paths?: number;              // paths for entry-time POP MC (default 1000)
  seed?: number;               // base seed; per-window seed = seed ^ entryIndex
  riskFreeRate?: number;       // default 0.045
}

export interface BacktestWindow {
  entryDate: string;
  exitDate: string;
  entrySpot: number;
  exitSpot: number;
  trailingVol: number;         // annualized decimal
  realizedPL: number;          // per share
  predictedPOP: number;        // 0..1
  win: boolean;
  legsSummary: string;
}

export interface BacktestAggregates {
  windows: number;
  winRate: number;             // 0..1
  avgPL: number;               // per share
  medianPL: number;
  stdPL: number;
  sharpe: number;              // annualized by sqrt(252 / dteDays)
  maxDrawdown: number;         // per share, positive number
  avgWin: number;              // mean of winning P/L (>=0 windows)
  avgLoss: number;             // mean of losing P/L (negative; we keep sign)
  rr: number;                  // avgWin / |avgLoss|, 0 if no losses
  brierScore: number;          // mean((predictedPOP - realized)^2), lower is better
  totalPL: number;             // sum of P/L per share
  bestWindowIdx: number;
  worstWindowIdx: number;
}

export interface BacktestResult {
  params: BacktestParams;
  windows: BacktestWindow[];
  aggregates: BacktestAggregates;
  cadenceStep: number;
  annualizationFactor: number;
  skipped: number;             // bars that were valid entry candidates but had no exit bar
}

/**
 * Binary-search the index of the first bar whose timestamp is >= targetMs.
 * Returns -1 if no such bar exists.
 */
function firstBarAtOrAfter(barTimes: number[], targetMs: number, from: number): number {
  let lo = from;
  let hi = barTimes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (barTimes[mid] < targetMs) lo = mid + 1;
    else hi = mid;
  }
  return lo < barTimes.length ? lo : -1;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = n >>> 1;
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function runBacktest(p: BacktestParams): BacktestResult {
  const {
    bars, strategy, dteDays, cadence,
    volLookbackBars = 30,
    paths = 1000,
    seed = 0xC0FFEE,
    riskFreeRate = 0.045,
  } = p;

  if (!supportsMonteCarloPayoff(strategy)) {
    throw new Error(`Backtest does not support ${strategy} (no payoff at expiry).`);
  }
  if (bars.length < volLookbackBars + 5) {
    throw new Error('Not enough price history to compute trailing vol.');
  }

  const cadenceStep = CADENCE_STEP_TRADING_DAYS[cadence];
  const annualizationFactor = Math.sqrt(252 / Math.max(1, dteDays));

  const barTimes = bars.map(b => new Date(b.date).getTime());
  const closes = bars.map(b => b.close);

  const windows: BacktestWindow[] = [];
  let skipped = 0;

  // Walk entries forward at the cadence step, starting at the first index where
  // we have enough trailing data to compute realized vol.
  for (let i = volLookbackBars; i < bars.length; i += cadenceStep) {
    const entrySpot = closes[i];
    if (!isFinite(entrySpot) || entrySpot <= 0) continue;

    // Trailing realized vol from the prior volLookbackBars closes.
    const trailCloses = closes.slice(i - volLookbackBars, i + 1);
    const trailReturns = computeLogReturns(trailCloses);
    const trailingVol = annualisedVol(trailReturns);
    if (!isFinite(trailingVol) || trailingVol <= 0) continue;

    // Locate exit bar: first bar whose date >= entry + dteDays calendar days.
    const targetExitMs = barTimes[i] + dteDays * 86_400_000;
    const exitIdx = firstBarAtOrAfter(barTimes, targetExitMs, i + 1);
    if (exitIdx < 0) { skipped++; continue; }
    const exitSpot = closes[exitIdx];
    if (!isFinite(exitSpot) || exitSpot <= 0) continue;

    // Select canonical strikes + BS-price legs using trailing vol.
    const { legs, summary } = selectStrikes(strategy, {
      spot: entrySpot,
      volAnnual: trailingVol,
      dteDays,
      riskFreeRate,
    });

    // Realized per-share P/L at the exit close.
    const realizedPL = payoffAtExpiry(strategy, legs, exitSpot);

    // Entry-time POP from a small terminal-GBM simulation.
    const terminals = simulateTerminalGBM({
      S0: entrySpot,
      T: dteDays / 365,
      paths,
      driftAnnual: 0,
      volAnnual: trailingVol,
      seed: (seed ^ i) >>> 0,
    });
    const sim = payoffVector(strategy, legs, terminals);
    let wins = 0;
    for (let k = 0; k < sim.length; k++) if (sim[k] > 0) wins++;
    const predictedPOP = sim.length ? wins / sim.length : 0;

    windows.push({
      entryDate: bars[i].date,
      exitDate: bars[exitIdx].date,
      entrySpot,
      exitSpot,
      trailingVol,
      realizedPL,
      predictedPOP,
      win: realizedPL > 0,
      legsSummary: summary,
    });
  }

  const aggregates = computeAggregates(windows, annualizationFactor);

  return {
    params: p,
    windows,
    aggregates,
    cadenceStep,
    annualizationFactor,
    skipped,
  };
}

function computeAggregates(windows: BacktestWindow[], annual: number): BacktestAggregates {
  const n = windows.length;
  if (n === 0) {
    return {
      windows: 0, winRate: 0, avgPL: 0, medianPL: 0, stdPL: 0,
      sharpe: 0, maxDrawdown: 0, avgWin: 0, avgLoss: 0, rr: 0,
      brierScore: 0, totalPL: 0, bestWindowIdx: -1, worstWindowIdx: -1,
    };
  }

  const pls = windows.map(w => w.realizedPL);
  const wins = pls.filter(x => x > 0);
  const losses = pls.filter(x => x < 0);

  const totalPL = pls.reduce((a, b) => a + b, 0);
  const avgPL = totalPL / n;
  const sorted = [...pls].sort((a, b) => a - b);
  const medianPL = median(sorted);

  let variance = 0;
  for (const x of pls) variance += (x - avgPL) * (x - avgPL);
  variance /= Math.max(1, n - 1);
  const stdPL = Math.sqrt(variance);

  const sharpe = stdPL > 0 ? (avgPL / stdPL) * annual : 0;

  // Max drawdown over the cumulative P/L equity curve.
  let cum = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const x of pls) {
    cum += x;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const avgWin  = wins.length   ? wins.reduce((a, b) => a + b, 0) / wins.length   : 0;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
  const rr = avgLoss < 0 ? avgWin / Math.abs(avgLoss) : 0;

  // Brier score: mean((p - y)^2), where y = 1 if win else 0.
  let brier = 0;
  for (const w of windows) {
    const y = w.win ? 1 : 0;
    brier += (w.predictedPOP - y) ** 2;
  }
  brier /= n;

  // Best / worst windows by realized P/L.
  let bestIdx = 0, worstIdx = 0;
  for (let i = 1; i < n; i++) {
    if (pls[i] > pls[bestIdx]) bestIdx = i;
    if (pls[i] < pls[worstIdx]) worstIdx = i;
  }

  return {
    windows: n,
    winRate: wins.length / n,
    avgPL,
    medianPL,
    stdPL,
    sharpe,
    maxDrawdown,
    avgWin,
    avgLoss,
    rr,
    brierScore: brier,
    totalPL,
    bestWindowIdx: bestIdx,
    worstWindowIdx: worstIdx,
  };
}

/** Cumulative P/L per share across the windows, in entry-date order. */
export function equityCurve(windows: BacktestWindow[]): { date: string; cum: number }[] {
  let cum = 0;
  return windows.map(w => {
    cum += w.realizedPL;
    return { date: w.entryDate, cum };
  });
}

/**
 * Build a histogram of per-share P/L. Returns evenly-spaced bins between
 * min(P/L) and max(P/L), padded slightly so the edge bins are not empty.
 */
export function plHistogram(
  windows: BacktestWindow[],
  bins = 20,
): { x: number; count: number }[] {
  if (windows.length === 0) return [];
  const pls = windows.map(w => w.realizedPL);
  let lo = Math.min(...pls);
  let hi = Math.max(...pls);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.02;
  lo -= pad; hi += pad;
  const step = (hi - lo) / bins;
  const out = Array.from({ length: bins }, (_, i) => ({ x: lo + (i + 0.5) * step, count: 0 }));
  for (const v of pls) {
    let idx = Math.floor((v - lo) / step);
    if (idx < 0) idx = 0;
    if (idx >= bins) idx = bins - 1;
    out[idx].count++;
  }
  return out;
}
