/**
 * Auto-strike selection for the Monte Carlo "Compare All Strategies" mode.
 *
 * Given a spot price, vol, and DTE, pick canonical strikes for each strategy
 * and price the option legs via Black-Scholes so the comparison is apples-to-
 * apples across the 12 MC-capable strategies.
 *
 * Moneyness rules (intentionally simple and interpretable):
 *   ATM       ~ spot
 *   5% OTM    spot × 1.05 (calls) / 0.95 (puts)
 *   10% OTM   spot × 1.10 (calls) / 0.90 (puts)  — used for condor wings
 *
 * Strategy bias (Bullish / Bearish / Neutral) is published alongside the legs
 * so the comparison view can filter by directional tilt.
 */

import { calcBlackScholes } from './blackScholes';
import type { StrategyId, StrategyLegs } from './strategyPayoff';

export type StrategyBias = 'Bullish' | 'Bearish' | 'Neutral';

export const STRATEGY_BIAS: Record<StrategyId, StrategyBias> = {
  'Long Call':           'Bullish',
  'Long Put':            'Bearish',
  'Bull Call Spread':    'Bullish',
  'Bear Put Spread':     'Bearish',
  'Put Credit Spread':   'Bullish',
  'Bear Call Spread':    'Bearish',
  'Cash-Secured Put':    'Bullish',
  'Covered Call':        'Bullish',
  'Protective Put':      'Bullish',
  'Collar':              'Neutral',
  'Iron Condor':         'Neutral',
  'Straddle / Strangle': 'Neutral',
  'Calendar Spread':     'Neutral',
};

export interface StrikeInputs {
  spot: number;
  volAnnual: number;      // decimal, e.g. 0.28
  dteDays: number;
  riskFreeRate?: number;  // decimal; default 0.045
}

export interface SelectedTrade {
  legs: StrategyLegs;
  summary: string;        // short human-readable leg summary for display
}

/** Round a strike to the nearest sensible tick given the spot price. */
function roundStrike(k: number, spot: number): number {
  if (spot >= 100) return Math.round(k);
  if (spot >= 25)  return Math.round(k * 2) / 2;       // $0.50
  if (spot >= 10)  return Math.round(k * 4) / 4;       // $0.25
  return Math.round(k * 10) / 10;                       // $0.10
}

/** Black-Scholes premium helper — returns 0 if BS can't price (should not happen for valid inputs). */
function price(
  kind: 'call' | 'put',
  strike: number,
  spot: number,
  volAnnual: number,
  T: number,
  r: number,
): number {
  const bs = calcBlackScholes({
    stockPrice: spot,
    strikePrice: strike,
    timeToExpiry: T,
    riskFreeRate: r,
    volatility: volAnnual,
    optionType: kind,
  });
  return bs?.price ?? 0;
}

export function selectStrikes(strategy: StrategyId, inputs: StrikeInputs): SelectedTrade {
  const { spot, volAnnual, dteDays } = inputs;
  const r = inputs.riskFreeRate ?? 0.045;
  const T = Math.max(1 / 365, dteDays / 365);

  const atm  = roundStrike(spot, spot);
  const k5U  = roundStrike(spot * 1.05, spot);
  const k10U = roundStrike(spot * 1.10, spot);
  const k5D  = roundStrike(spot * 0.95, spot);
  const k10D = roundStrike(spot * 0.90, spot);

  const callAt = (k: number) => price('call', k, spot, volAnnual, T, r);
  const putAt  = (k: number) => price('put',  k, spot, volAnnual, T, r);

  const $ = (n: number) => `$${n.toFixed(n >= 10 ? 0 : 2)}`;

  switch (strategy) {
    case 'Long Call': {
      const prem = callAt(atm);
      return {
        legs: { longCallStrike: atm, longCallPremium: prem },
        summary: `Long C ${$(atm)} @ ${$(prem)}`,
      };
    }

    case 'Long Put': {
      const prem = putAt(atm);
      return {
        legs: { longPutStrike: atm, longPutPremium: prem },
        summary: `Long P ${$(atm)} @ ${$(prem)}`,
      };
    }

    case 'Bull Call Spread': {
      const lp = callAt(atm);
      const sp = callAt(k5U);
      return {
        legs: {
          longCallStrike: atm,  longCallPremium: lp,
          shortCallStrike: k5U, shortCallPremium: sp,
        },
        summary: `Long C ${$(atm)} / Short C ${$(k5U)}`,
      };
    }

    case 'Bear Put Spread': {
      const lp = putAt(atm);
      const sp = putAt(k5D);
      return {
        legs: {
          longPutStrike: atm,  longPutPremium: lp,
          shortPutStrike: k5D, shortPutPremium: sp,
        },
        summary: `Long P ${$(atm)} / Short P ${$(k5D)}`,
      };
    }

    case 'Put Credit Spread': {
      // Short 5% OTM put (closer to money), long 10% OTM put (further)
      const sp = putAt(k5D);
      const lp = putAt(k10D);
      return {
        legs: {
          shortPutStrike: k5D,  shortPutPremium: sp,
          longPutStrike:  k10D, longPutPremium:  lp,
        },
        summary: `Short P ${$(k5D)} / Long P ${$(k10D)}`,
      };
    }

    case 'Bear Call Spread': {
      // Short 5% OTM call (closer to money), long 10% OTM call (further)
      const sc = callAt(k5U);
      const lc = callAt(k10U);
      return {
        legs: {
          shortCallStrike: k5U,  shortCallPremium: sc,
          longCallStrike:  k10U, longCallPremium:  lc,
        },
        summary: `Short C ${$(k5U)} / Long C ${$(k10U)}`,
      };
    }

    case 'Cash-Secured Put': {
      const sp = putAt(k5D);
      return {
        legs: { shortPutStrike: k5D, shortPutPremium: sp },
        summary: `Short P ${$(k5D)} @ ${$(sp)}`,
      };
    }

    case 'Covered Call': {
      const sc = callAt(k5U);
      return {
        legs: { stockBasis: spot, shortCallStrike: k5U, shortCallPremium: sc },
        summary: `Own @ ${$(spot)} / Short C ${$(k5U)}`,
      };
    }

    case 'Protective Put': {
      const lp = putAt(k5D);
      return {
        legs: { stockBasis: spot, longPutStrike: k5D, longPutPremium: lp },
        summary: `Own @ ${$(spot)} / Long P ${$(k5D)}`,
      };
    }

    case 'Collar': {
      const lp = putAt(k5D);
      const sc = callAt(k5U);
      return {
        legs: {
          stockBasis: spot,
          longPutStrike: k5D,  longPutPremium: lp,
          shortCallStrike: k5U, shortCallPremium: sc,
        },
        summary: `Own @ ${$(spot)} / Long P ${$(k5D)} / Short C ${$(k5U)}`,
      };
    }

    case 'Iron Condor': {
      const lpLow  = putAt(k10D);
      const spInner = putAt(k5D);
      const scInner = callAt(k5U);
      const lcHigh  = callAt(k10U);
      return {
        legs: {
          longPutStrike:  k10D, longPutPremium:  lpLow,
          shortPutStrike: k5D,  shortPutPremium: spInner,
          shortCallStrike: k5U, shortCallPremium: scInner,
          longCallStrike: k10U, longCallPremium: lcHigh,
        },
        summary: `IC ${$(k10D)}/${$(k5D)} – ${$(k5U)}/${$(k10U)}`,
      };
    }

    case 'Straddle / Strangle': {
      // Long ATM straddle — both legs ATM.
      const lc = callAt(atm);
      const lp = putAt(atm);
      return {
        legs: {
          longCallStrike: atm, longCallPremium: lc,
          longPutStrike:  atm, longPutPremium:  lp,
        },
        summary: `Long C+P ${$(atm)}`,
      };
    }

    case 'Calendar Spread': {
      // Unsupported in MC v1 — return empty legs; caller gates this via supportsMonteCarloPayoff.
      return { legs: {}, summary: '—' };
    }

    default: {
      const _exhaustive: never = strategy;
      return _exhaustive;
    }
  }
}
