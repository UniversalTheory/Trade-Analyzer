/**
 * Monte Carlo core engine.
 *
 * simulatePricePaths returns a flat Float64Array of length `paths * (steps + 1)`,
 * laid out row-major: path p, step s at index p * (steps + 1) + s.
 * Row 0 is always the starting price S0.
 *
 * Two models are supported:
 *  - 'gbm': geometric Brownian motion, parameterised by annualised drift and vol.
 *           S_{t+dt} = S_t · exp((μ − σ²/2) · dt + σ · √dt · Z),  Z ~ N(0,1)
 *  - 'bootstrap': resample daily log-returns with replacement from a historical
 *                 series. Non-parametric; captures fat tails and skew.
 *
 * Both return the same terminal price vector shape, so downstream payoff
 * evaluation is identical for either model.
 */

import { mulberry32, makeNormal } from './prng';

export type MCModel = 'gbm' | 'bootstrap';

export interface MCParams {
  model: MCModel;
  S0: number;            // spot price
  T: number;             // time to expiry, in years
  steps: number;         // number of discrete timesteps (typically trading days until expiry)
  paths: number;         // number of simulated paths
  driftAnnual?: number;  // expected annualised return (decimal). Default: 0
  volAnnual?: number;    // annualised volatility (decimal). Required for GBM.
  histReturns?: number[];// daily log returns, required for bootstrap mode
  seed?: number;         // PRNG seed. Default: Date.now()
}

export interface MCResult {
  paths: Float64Array;        // flat matrix, row-major: paths rows × (steps+1) cols
  terminalPrices: Float64Array; // length = paths; the last column of the matrix
  nPaths: number;
  nSteps: number;
  elapsedMs: number;
}

/** Fast terminal-only GBM — no intermediate path storage. Used by Trade Recs for lightweight POP. */
export interface MCTerminalParams {
  S0: number;
  T: number;
  paths: number;
  driftAnnual: number;
  volAnnual: number;
  seed?: number;
}

export function simulateTerminalGBM(params: MCTerminalParams): Float64Array {
  const { S0, T, paths, driftAnnual, volAnnual, seed } = params;
  const rand = mulberry32(seed ?? Date.now());
  const norm = makeNormal(rand);
  const drift = (driftAnnual - 0.5 * volAnnual * volAnnual) * T;
  const diffusion = volAnnual * Math.sqrt(T);
  const out = new Float64Array(paths);
  for (let i = 0; i < paths; i++) {
    out[i] = S0 * Math.exp(drift + diffusion * norm());
  }
  return out;
}

export function simulatePricePaths(params: MCParams): MCResult {
  const t0 = performance.now();
  const {
    model, S0, T, steps, paths,
    driftAnnual = 0, volAnnual, histReturns,
    seed,
  } = params;

  if (paths <= 0 || steps <= 0) throw new Error('paths and steps must be > 0');

  const rand = mulberry32(seed ?? Date.now());
  const cols = steps + 1;
  const matrix = new Float64Array(paths * cols);

  if (model === 'gbm') {
    if (volAnnual == null) throw new Error('GBM model requires volAnnual');
    const norm = makeNormal(rand);
    const dt = T / steps;
    const drift = (driftAnnual - 0.5 * volAnnual * volAnnual) * dt;
    const diffusion = volAnnual * Math.sqrt(dt);

    for (let p = 0; p < paths; p++) {
      const rowStart = p * cols;
      matrix[rowStart] = S0;
      let prev = S0;
      for (let s = 1; s < cols; s++) {
        prev = prev * Math.exp(drift + diffusion * norm());
        matrix[rowStart + s] = prev;
      }
    }
  } else {
    // Historical bootstrap
    if (!histReturns || histReturns.length === 0) {
      throw new Error('Bootstrap model requires a non-empty histReturns array');
    }
    const n = histReturns.length;
    for (let p = 0; p < paths; p++) {
      const rowStart = p * cols;
      matrix[rowStart] = S0;
      let prev = S0;
      for (let s = 1; s < cols; s++) {
        const r = histReturns[(rand() * n) | 0];
        prev = prev * Math.exp(r);
        matrix[rowStart + s] = prev;
      }
    }
  }

  const terminalPrices = new Float64Array(paths);
  for (let p = 0; p < paths; p++) {
    terminalPrices[p] = matrix[p * cols + (cols - 1)];
  }

  return {
    paths: matrix,
    terminalPrices,
    nPaths: paths,
    nSteps: steps,
    elapsedMs: performance.now() - t0,
  };
}

/** Compute daily log returns from a series of closes. */
export function computeLogReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      out.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  return out;
}

/** Annualised volatility from a series of daily log returns (assumes 252 trading days). */
export function annualisedVol(dailyLogReturns: number[]): number {
  const n = dailyLogReturns.length;
  if (n < 2) return 0;
  const mean = dailyLogReturns.reduce((a, b) => a + b, 0) / n;
  let variance = 0;
  for (const r of dailyLogReturns) variance += (r - mean) * (r - mean);
  variance /= (n - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}
