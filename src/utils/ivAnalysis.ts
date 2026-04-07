import type { PriceBar, OptionsChainData, OptionContract } from '../api/types';

export interface IVAnalysis {
  atmIV: number;                // ATM implied volatility (decimal, e.g. 0.28)
  hv30: number;                 // 30-day historical volatility (decimal)
  hvToIvRatio: number;          // IV / HV ratio
  ivPercentileEstimate: number; // 0-100
  ivRank: 'low' | 'below-avg' | 'average' | 'above-avg' | 'high';
  putCallOIRatio: number;       // total put OI / total call OI
  meanCallIV: number;
  meanPutIV: number;
  ivSkew: number;               // ATM put IV - ATM call IV (positive = put skew)
}

/**
 * Compute 30-day annualized historical volatility from daily price bars.
 */
function computeHV(bars: PriceBar[], window = 30): number {
  if (bars.length < window + 1) return 0;

  const closes = bars.slice(-(window + 1)).map(b => b.close);
  const logReturns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  if (logReturns.length < 10) return 0;

  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance * 252); // annualize
}

/**
 * Find the ATM call and put from the chain (strikes closest to current price).
 */
function findATMContracts(
  chain: OptionsChainData,
  currentPrice: number,
): { atmCall: OptionContract | null; atmPut: OptionContract | null } {
  const findClosest = (contracts: OptionContract[]): OptionContract | null => {
    if (contracts.length === 0) return null;
    return contracts.reduce((best, c) =>
      Math.abs(c.strike - currentPrice) < Math.abs(best.strike - currentPrice) ? c : best
    );
  };

  return {
    atmCall: findClosest(chain.calls.filter(c => c.impliedVolatility > 0)),
    atmPut: findClosest(chain.puts.filter(c => c.impliedVolatility > 0)),
  };
}

/**
 * Map IV/HV ratio to an estimated IV percentile (0-100).
 */
function estimateIVPercentile(ivHvRatio: number): number {
  if (ivHvRatio < 0.85) return 15;
  if (ivHvRatio < 1.0)  return 30;
  if (ivHvRatio < 1.2)  return 50;
  if (ivHvRatio < 1.5)  return 70;
  if (ivHvRatio < 2.0)  return 85;
  return 93;
}

function ivRankFromPercentile(pct: number): IVAnalysis['ivRank'] {
  if (pct <= 20) return 'low';
  if (pct <= 40) return 'below-avg';
  if (pct <= 60) return 'average';
  if (pct <= 80) return 'above-avg';
  return 'high';
}

/**
 * Compute mean IV across contracts, weighted by open interest.
 */
function weightedMeanIV(contracts: OptionContract[]): number {
  const valid = contracts.filter(c => c.impliedVolatility > 0 && c.openInterest > 0);
  if (valid.length === 0) {
    // Fallback to unweighted mean
    const all = contracts.filter(c => c.impliedVolatility > 0);
    if (all.length === 0) return 0;
    return all.reduce((s, c) => s + c.impliedVolatility, 0) / all.length;
  }
  const totalOI = valid.reduce((s, c) => s + c.openInterest, 0);
  return valid.reduce((s, c) => s + c.impliedVolatility * (c.openInterest / totalOI), 0);
}

/**
 * Main IV analysis function.
 */
export function analyzeIV(
  chain: OptionsChainData,
  currentPrice: number,
  bars: PriceBar[],
): IVAnalysis | null {
  if (chain.calls.length === 0 && chain.puts.length === 0) return null;

  const { atmCall, atmPut } = findATMContracts(chain, currentPrice);
  if (!atmCall && !atmPut) return null;

  // ATM IV: average of call and put ATM IVs
  const callIV = atmCall?.impliedVolatility ?? 0;
  const putIV = atmPut?.impliedVolatility ?? 0;
  const atmIV = callIV > 0 && putIV > 0
    ? (callIV + putIV) / 2
    : callIV > 0 ? callIV : putIV;

  if (atmIV <= 0) return null;

  // Historical volatility
  const hv30 = computeHV(bars, 30);

  // IV/HV ratio and percentile estimate
  const hvToIvRatio = hv30 > 0 ? atmIV / hv30 : 1.2; // default to slightly elevated if no HV
  const ivPercentileEstimate = estimateIVPercentile(hvToIvRatio);
  const ivRank = ivRankFromPercentile(ivPercentileEstimate);

  // Put/Call OI ratio
  const totalCallOI = chain.calls.reduce((s, c) => s + (c.openInterest || 0), 0);
  const totalPutOI = chain.puts.reduce((s, c) => s + (c.openInterest || 0), 0);
  const putCallOIRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;

  // Mean IVs
  const meanCallIV = weightedMeanIV(chain.calls);
  const meanPutIV = weightedMeanIV(chain.puts);

  // IV Skew: put IV minus call IV at ATM (positive = put skew / fear)
  const ivSkew = (putIV > 0 && callIV > 0) ? putIV - callIV : 0;

  return {
    atmIV,
    hv30,
    hvToIvRatio,
    ivPercentileEstimate,
    ivRank,
    putCallOIRatio,
    meanCallIV,
    meanPutIV,
    ivSkew,
  };
}
