/**
 * Pure statistics on an MC-produced P/L vector.
 *
 * Inputs are always per-share P/L (Float64Array from payoffVector). Outputs
 * are per-share dollar amounts; the caller multiplies by 100 × contracts for
 * position-level dollar figures.
 *
 * `tradeVerdict()` is a deliberately simple rule-based classifier — it's
 * useful as an at-a-glance go/no-go gut-check, not as a substitute for the
 * full metric grid shown in the UI.
 */

export interface DistributionAnalysis {
  pop: number;           // probability of profit (P/L > 0), in [0, 1]
  stdErrOfPop: number;   // 1-sigma standard error on POP estimate
  meanPnl: number;       // expected per-share P/L
  medianPnl: number;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  var95: number;         // value-at-risk (5th percentile loss, reported as positive number)
  cvar95: number;        // expected shortfall: mean P/L in the worst 5% tail (positive loss number)
  maxGain: number;       // best observed per-share P/L
  maxLoss: number;       // worst observed per-share P/L (negative number)
  nPaths: number;
}

/** Analyse a per-share P/L vector produced by `payoffVector()`. */
export function analyzeDistribution(pnl: Float64Array): DistributionAnalysis {
  const n = pnl.length;
  if (n === 0) {
    return {
      pop: 0, stdErrOfPop: 0, meanPnl: 0, medianPnl: 0,
      percentiles: { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0 },
      var95: 0, cvar95: 0, maxGain: 0, maxLoss: 0, nPaths: 0,
    };
  }

  // Single pass: sum, winners, min, max
  let sum = 0;
  let winners = 0;
  let maxGain = -Infinity;
  let maxLoss = Infinity;
  for (let i = 0; i < n; i++) {
    const v = pnl[i];
    sum += v;
    if (v > 0) winners++;
    if (v > maxGain) maxGain = v;
    if (v < maxLoss) maxLoss = v;
  }
  const meanPnl = sum / n;
  const pop = winners / n;
  // Binomial standard error on the POP estimate
  const stdErrOfPop = Math.sqrt(Math.max(pop * (1 - pop), 0) / n);

  // Sort a copy for percentile-based metrics
  const sorted = new Float64Array(pnl);
  sorted.sort();

  const pct = (q: number): number => {
    const idx = Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))));
    return sorted[idx];
  };

  const p5 = pct(0.05);
  const p25 = pct(0.25);
  const p50 = pct(0.50);
  const p75 = pct(0.75);
  const p95 = pct(0.95);

  // VaR95: loss at the 5th percentile (flip sign so it's reported as a positive "loss")
  const var95 = Math.max(0, -p5);

  // CVaR95: mean of the worst 5% tail (again reported as positive loss)
  const tailCount = Math.max(1, Math.floor(0.05 * n));
  let tailSum = 0;
  for (let i = 0; i < tailCount; i++) tailSum += sorted[i];
  const cvar95 = Math.max(0, -(tailSum / tailCount));

  return {
    pop,
    stdErrOfPop,
    meanPnl,
    medianPnl: p50,
    percentiles: { p5, p25, p50, p75, p95 },
    var95,
    cvar95,
    maxGain,
    maxLoss,
    nPaths: n,
  };
}

// ── Verdict classifier ───────────────────────────────────────────────────────

export type VerdictLevel = 'Strong' | 'OK' | 'Weak' | 'Avoid';

export interface VerdictInput {
  pop: number;       // probability of profit in [0, 1]
  ev: number;        // expected per-share P/L (dollars)
  rrRatio: number;   // |maxGain / maxLoss|; use Infinity for unlimited upside
}

export interface Verdict {
  level: VerdictLevel;
  rationale: string;
}

/**
 * Rule-based composite classifier.
 *  - Strong : POP ≥ 65% AND EV > 0 AND R:R ≥ 1
 *  - OK     : POP ≥ 50% AND EV > 0
 *  - Weak   : EV ≤ 0 but POP ≥ 50% (likely to win in nominal terms but tail dominates)
 *  - Avoid  : POP < 50% AND EV ≤ 0
 */
export function tradeVerdict(input: VerdictInput): Verdict {
  const { pop, ev, rrRatio } = input;
  const popPct = (pop * 100).toFixed(0);

  if (pop >= 0.65 && ev > 0 && rrRatio >= 1) {
    return {
      level: 'Strong',
      rationale: `${popPct}% POP with positive expected value and R:R ≥ 1 — edge in both frequency and magnitude.`,
    };
  }
  if (pop >= 0.50 && ev > 0) {
    return {
      level: 'OK',
      rationale: `${popPct}% POP with positive expected value, though R:R or win rate could be stronger.`,
    };
  }
  if (pop >= 0.50 && ev <= 0) {
    return {
      level: 'Weak',
      rationale: `${popPct}% POP but negative expected value — tail losses outweigh the frequent small wins.`,
    };
  }
  return {
    level: 'Avoid',
    rationale: `${popPct}% POP and non-positive expected value — no statistical edge in this trade.`,
  };
}

/** Helper to compute R:R from the analysis, handling unlimited upside / zero loss. */
export function riskRewardRatio(a: DistributionAnalysis): number {
  if (a.maxLoss >= 0) return Infinity;   // no losing path observed
  if (a.maxGain <= 0) return 0;           // no winning path observed
  return a.maxGain / Math.abs(a.maxLoss);
}
