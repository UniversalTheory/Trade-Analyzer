/**
 * Strategy payoff math at expiry.
 *
 * All payoffs are expressed per SHARE (not per contract). Multiply by 100
 * and by the number of contracts to get dollar P/L.
 *
 * A unified `StrategyLegs` struct holds every possible field; each strategy
 * reads only the fields it needs. This keeps the MC engine and UI simple:
 * build one legs object from form input, call payoff(), done.
 *
 * Vectorised `payoffVector` is the hot path for Monte Carlo — it avoids any
 * allocation per terminal price, enabling 10K+ evaluations in <10ms.
 */

export const STRATEGIES = [
  'Long Call',
  'Long Put',
  'Bull Call Spread',
  'Bear Put Spread',
  'Put Credit Spread',
  'Bear Call Spread',
  'Cash-Secured Put',
  'Covered Call',
  'Protective Put',
  'Collar',
  'Iron Condor',
  'Straddle / Strangle',
  'Calendar Spread',
] as const;

export type StrategyId = typeof STRATEGIES[number];

export interface StrategyLegs {
  // Option leg strikes and premiums (per share)
  longCallStrike?: number;
  longCallPremium?: number;
  shortCallStrike?: number;
  shortCallPremium?: number;
  longPutStrike?: number;
  longPutPremium?: number;
  shortPutStrike?: number;
  shortPutPremium?: number;
  // Underlying basis (cost of shares already held) for covered positions
  stockBasis?: number;
  // Net credit / debit for spreads entered as a single net number
  netCredit?: number;
}

// ── Primitive leg payoffs (per share) ────────────────────────────────────────

const longCall = (K: number, prem: number, S: number): number => Math.max(S - K, 0) - prem;
const longPut  = (K: number, prem: number, S: number): number => Math.max(K - S, 0) - prem;
const shortCall = (K: number, prem: number, S: number): number => prem - Math.max(S - K, 0);
const shortPut  = (K: number, prem: number, S: number): number => prem - Math.max(K - S, 0);

// ── Strategy payoff dispatcher ───────────────────────────────────────────────

const num = (v: number | undefined): number => v ?? 0;

export function payoffAtExpiry(strategy: StrategyId, legs: StrategyLegs, S: number): number {
  switch (strategy) {
    case 'Long Call':
      return longCall(num(legs.longCallStrike), num(legs.longCallPremium), S);

    case 'Long Put':
      return longPut(num(legs.longPutStrike), num(legs.longPutPremium), S);

    case 'Bull Call Spread':
      return longCall(num(legs.longCallStrike), num(legs.longCallPremium), S)
           + shortCall(num(legs.shortCallStrike), num(legs.shortCallPremium), S);

    case 'Bear Put Spread':
      return longPut(num(legs.longPutStrike), num(legs.longPutPremium), S)
           + shortPut(num(legs.shortPutStrike), num(legs.shortPutPremium), S);

    case 'Put Credit Spread':
      // Short higher put, long lower put
      return shortPut(num(legs.shortPutStrike), num(legs.shortPutPremium), S)
           + longPut(num(legs.longPutStrike), num(legs.longPutPremium), S);

    case 'Bear Call Spread':
      // Short lower call, long higher call
      return shortCall(num(legs.shortCallStrike), num(legs.shortCallPremium), S)
           + longCall(num(legs.longCallStrike), num(legs.longCallPremium), S);

    case 'Cash-Secured Put':
      return shortPut(num(legs.shortPutStrike), num(legs.shortPutPremium), S);

    case 'Covered Call':
      return (S - num(legs.stockBasis))
           + shortCall(num(legs.shortCallStrike), num(legs.shortCallPremium), S);

    case 'Protective Put':
      return (S - num(legs.stockBasis))
           + longPut(num(legs.longPutStrike), num(legs.longPutPremium), S);

    case 'Collar':
      return (S - num(legs.stockBasis))
           + longPut(num(legs.longPutStrike), num(legs.longPutPremium), S)
           + shortCall(num(legs.shortCallStrike), num(legs.shortCallPremium), S);

    case 'Iron Condor':
      return longPut(num(legs.longPutStrike), num(legs.longPutPremium), S)
           + shortPut(num(legs.shortPutStrike), num(legs.shortPutPremium), S)
           + shortCall(num(legs.shortCallStrike), num(legs.shortCallPremium), S)
           + longCall(num(legs.longCallStrike), num(legs.longCallPremium), S);

    case 'Straddle / Strangle':
      return longCall(num(legs.longCallStrike), num(legs.longCallPremium), S)
           + longPut(num(legs.longPutStrike), num(legs.longPutPremium), S);

    case 'Calendar Spread':
      // Calendar payoff at front expiry depends on re-pricing the back-month option,
      // which requires a Black-Scholes evaluation (outside MC scope for v1).
      // Return 0 so MC leaves the existing heuristic POP untouched for this strategy.
      return 0;

    default: {
      // Exhaustiveness safety
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}

/** Returns true if this strategy has a well-defined MC payoff at expiry. */
export function supportsMonteCarloPayoff(strategy: StrategyId): boolean {
  return strategy !== 'Calendar Spread';
}

/**
 * Vectorised per-share P/L over an array of terminal prices.
 * Hot path for Monte Carlo — preallocates output, no per-iteration allocation.
 */
export function payoffVector(
  strategy: StrategyId,
  legs: StrategyLegs,
  terminalPrices: Float64Array,
): Float64Array {
  const n = terminalPrices.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = payoffAtExpiry(strategy, legs, terminalPrices[i]);
  }
  return out;
}

// ── Analytic breakeven / max gain / loss (best-effort, for display) ──────────

export interface StrategyProfile {
  maxGainPerShare: number | null;  // null = unlimited
  maxLossPerShare: number | null;  // null = unlimited
  breakevens: number[];
}

/**
 * Numerically derive breakevens + bounds from payoff evaluated across a price grid.
 * Simple/robust — relies on the payoff function, so always consistent with MC.
 */
export function profileFromPayoff(
  strategy: StrategyId,
  legs: StrategyLegs,
  spot: number,
): StrategyProfile {
  const lo = Math.max(0.01, spot * 0.3);
  const hi = spot * 2.5;
  const N = 400;
  const step = (hi - lo) / (N - 1);

  let maxG = -Infinity;
  let maxL = Infinity;
  const prices: number[] = [];
  const pls: number[] = [];
  for (let i = 0; i < N; i++) {
    const p = lo + i * step;
    const pl = payoffAtExpiry(strategy, legs, p);
    prices.push(p);
    pls.push(pl);
    if (pl > maxG) maxG = pl;
    if (pl < maxL) maxL = pl;
  }

  // Find breakevens via linear interpolation
  const bes: number[] = [];
  for (let i = 1; i < N; i++) {
    if ((pls[i - 1] <= 0 && pls[i] > 0) || (pls[i - 1] >= 0 && pls[i] < 0)) {
      const t = Math.abs(pls[i - 1]) / (Math.abs(pls[i - 1]) + Math.abs(pls[i]));
      bes.push(prices[i - 1] + t * step);
    }
  }

  // Detect unlimited: check slope of last few points
  const tailSlope = (pls[N - 1] - pls[N - 10]) / (prices[N - 1] - prices[N - 10]);
  const headSlope = (pls[9] - pls[0]) / (prices[9] - prices[0]);
  const unlimitedUp = tailSlope > 0.5;
  const unlimitedDown = headSlope < -0.5;

  return {
    maxGainPerShare: unlimitedUp ? null : maxG,
    maxLossPerShare: unlimitedDown ? null : maxL,
    breakevens: bes,
  };
}
