import type { QuoteData, FundamentalsData, OptionsChainData, OptionContract } from '../api/types';
import { calcBlackScholes } from './blackScholes';
import type { IVAnalysis } from './ivAnalysis';

export interface RiskFactor {
  factor: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

export interface RiskBreakdown {
  maxLoss: string;
  maxGain: string;
  riskRewardRatio: number | null; // null if unlimited on one side
  probabilityEstimate: number;    // 0-100, rough POP estimate
  breakeven: string;
  keyRiskFactors: RiskFactor[];
  managementTips: string[];
}

interface OptionPrices {
  atmCallPrice: number;
  atmPutPrice: number;
  otmCallPrice: number; // ~5% OTM
  otmPutPrice: number;  // ~5% OTM
  atmStrike: number;
  otmCallStrike: number;
  otmPutStrike: number;
}

/**
 * Get representative option prices from chain or Black-Scholes fallback.
 */
function getOptionPrices(
  quote: QuoteData,
  chain?: OptionsChainData,
  iv?: IVAnalysis,
): OptionPrices {
  const price = quote.price;
  const atmStrike = Math.round(price); // nearest whole dollar
  const otmCallStrike = Math.round(price * 1.05);
  const otmPutStrike = Math.round(price * 0.95);

  if (chain && chain.calls.length > 0 && chain.puts.length > 0) {
    const findNearest = (contracts: OptionContract[], target: number): OptionContract | null => {
      const valid = contracts.filter(c => c.bid > 0 || c.lastPrice > 0);
      if (valid.length === 0) return null;
      return valid.reduce((best, c) =>
        Math.abs(c.strike - target) < Math.abs(best.strike - target) ? c : best
      );
    };

    const midPrice = (c: OptionContract | null): number => {
      if (!c) return 0;
      if (c.bid > 0 && c.ask > 0) return (c.bid + c.ask) / 2;
      return c.lastPrice || 0;
    };

    const atmCall = findNearest(chain.calls, atmStrike);
    const atmPut = findNearest(chain.puts, atmStrike);
    const otmCall = findNearest(chain.calls, otmCallStrike);
    const otmPut = findNearest(chain.puts, otmPutStrike);

    return {
      atmCallPrice: midPrice(atmCall),
      atmPutPrice: midPrice(atmPut),
      otmCallPrice: midPrice(otmCall),
      otmPutPrice: midPrice(otmPut),
      atmStrike: atmCall?.strike ?? atmStrike,
      otmCallStrike: otmCall?.strike ?? otmCallStrike,
      otmPutStrike: otmPut?.strike ?? otmPutStrike,
    };
  }

  // Black-Scholes fallback
  const vol = iv?.atmIV ?? 0.30;
  const t = 30 / 365; // assume ~30 DTE
  const r = 0.045;

  const bsATMCall = calcBlackScholes({ stockPrice: price, strikePrice: atmStrike, timeToExpiry: t, riskFreeRate: r, volatility: vol, optionType: 'call' });
  const bsATMPut = calcBlackScholes({ stockPrice: price, strikePrice: atmStrike, timeToExpiry: t, riskFreeRate: r, volatility: vol, optionType: 'put' });
  const bsOTMCall = calcBlackScholes({ stockPrice: price, strikePrice: otmCallStrike, timeToExpiry: t, riskFreeRate: r, volatility: vol, optionType: 'call' });
  const bsOTMPut = calcBlackScholes({ stockPrice: price, strikePrice: otmPutStrike, timeToExpiry: t, riskFreeRate: r, volatility: vol, optionType: 'put' });

  return {
    atmCallPrice: bsATMCall?.price ?? 0,
    atmPutPrice: bsATMPut?.price ?? 0,
    otmCallPrice: bsOTMCall?.price ?? 0,
    otmPutPrice: bsOTMPut?.price ?? 0,
    atmStrike,
    otmCallStrike,
    otmPutStrike,
  };
}

function fmt$(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmt$dec(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build key risk factors from available data.
 */
function buildRiskFactors(
  fundamentals?: FundamentalsData,
  iv?: IVAnalysis,
): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (fundamentals?.beta != null && fundamentals.beta > 1.3) {
    factors.push({
      factor: `High beta (${fundamentals.beta.toFixed(2)})`,
      severity: fundamentals.beta > 1.8 ? 'high' : 'medium',
      description: 'Stock moves more than the market — expect larger swings in both directions',
    });
  }

  if (fundamentals?.debtToEquity != null && fundamentals.debtToEquity > 2.0) {
    factors.push({
      factor: `Elevated debt (D/E ${fundamentals.debtToEquity.toFixed(1)})`,
      severity: fundamentals.debtToEquity > 4.0 ? 'high' : 'medium',
      description: 'High leverage increases sensitivity to rate changes and downside risk',
    });
  }

  if (fundamentals?.shortPercentFloat != null && fundamentals.shortPercentFloat > 0.10) {
    const pct = (fundamentals.shortPercentFloat * 100).toFixed(1);
    factors.push({
      factor: `Short interest ${pct}%`,
      severity: fundamentals.shortPercentFloat > 0.20 ? 'high' : 'medium',
      description: 'Elevated short interest can cause volatile moves in both directions',
    });
  }

  if (iv) {
    if (iv.ivPercentileEstimate > 80) {
      factors.push({
        factor: 'Elevated IV',
        severity: 'medium',
        description: `IV at ~${iv.ivPercentileEstimate}th percentile — premiums are expensive, favors selling`,
      });
    } else if (iv.ivPercentileEstimate < 20) {
      factors.push({
        factor: 'Low IV',
        severity: 'low',
        description: `IV at ~${iv.ivPercentileEstimate}th percentile — premiums are cheap, favors buying`,
      });
    }

    if (iv.putCallOIRatio > 1.5) {
      factors.push({
        factor: `High put/call ratio (${iv.putCallOIRatio.toFixed(2)})`,
        severity: 'medium',
        description: 'Heavy put positioning suggests elevated hedging or bearish sentiment',
      });
    }
  }

  return factors;
}

/**
 * Calculate risk breakdown for a given strategy.
 */
export function calculateRisk(
  strategy: string,
  quote: QuoteData,
  chain?: OptionsChainData,
  fundamentals?: FundamentalsData,
  iv?: IVAnalysis,
): RiskBreakdown {
  const op = getOptionPrices(quote, chain, iv);
  const keyRiskFactors = buildRiskFactors(fundamentals, iv);
  const price = quote.price;

  switch (strategy) {
    case 'Long Call': {
      const premium = op.atmCallPrice * 100;
      const be = op.atmStrike + op.atmCallPrice;
      return {
        maxLoss: `${fmt$(premium)} (premium paid)`,
        maxGain: 'Unlimited',
        riskRewardRatio: null,
        probabilityEstimate: 45, // roughly ATM delta
        breakeven: `${fmt$dec(be)}`,
        keyRiskFactors,
        managementTips: [
          'Consider taking profits at 50-100% of premium paid',
          'Cut losses if the option loses 50% of its value',
          'Roll to later expiration if thesis intact with 14 DTE remaining',
        ],
      };
    }

    case 'Bull Call Spread': {
      const debit = Math.max(0, op.atmCallPrice - op.otmCallPrice);
      const spreadWidth = op.otmCallStrike - op.atmStrike;
      const maxGain = Math.max(0, spreadWidth - debit);
      const be = op.atmStrike + debit;
      const rr = debit > 0 ? maxGain / debit : 0;
      const pop = spreadWidth > 0 ? Math.round((1 - debit / spreadWidth) * 100) : 50;
      return {
        maxLoss: `${fmt$(debit * 100)} (net debit)`,
        maxGain: `${fmt$(maxGain * 100)}`,
        riskRewardRatio: Math.round(rr * 100) / 100,
        probabilityEstimate: pop,
        breakeven: `${fmt$dec(be)}`,
        keyRiskFactors,
        managementTips: [
          'Close at 50-75% of max profit to lock in gains',
          'Cut losses at 50% of debit paid if move stalls',
          'Time decay works against you — manage before final 2 weeks',
        ],
      };
    }

    case 'Put Credit Spread': {
      const credit = Math.max(0, op.otmPutPrice - (op.otmPutPrice * 0.4)); // approximate: sell near OTM, buy further OTM
      const actualCredit = op.otmPutPrice * 0.6; // rough estimate
      const spreadWidth = op.otmPutStrike - Math.round(price * 0.90);
      const maxLoss = Math.max(0, spreadWidth - actualCredit);
      const be = op.otmPutStrike - actualCredit;
      const rr = maxLoss > 0 ? actualCredit / maxLoss : 0;
      return {
        maxLoss: `${fmt$(maxLoss * 100)}`,
        maxGain: `${fmt$(actualCredit * 100)} (credit received)`,
        riskRewardRatio: Math.round(rr * 100) / 100,
        probabilityEstimate: 65,
        breakeven: `${fmt$dec(be)}`,
        keyRiskFactors,
        managementTips: [
          'Close at 50% of max profit — capture premium decay early',
          'Defend or close if stock approaches the short strike',
          'Best entered when IV is elevated for richer premiums',
        ],
      };
    }

    case 'Cash-Secured Put': {
      const premium = op.otmPutPrice * 100;
      const be = op.otmPutStrike - op.otmPutPrice;
      const maxLoss = (be) * 100; // stock to zero minus premium
      return {
        maxLoss: `${fmt$(maxLoss)} (if stock goes to $0)`,
        maxGain: `${fmt$(premium)} (premium received)`,
        riskRewardRatio: null,
        probabilityEstimate: 70,
        breakeven: `${fmt$dec(be)}`,
        keyRiskFactors,
        managementTips: [
          'Only sell puts on stocks you would be willing to own',
          'Close at 50% of premium to free up capital early',
          'Roll down and out if threatened to avoid assignment',
        ],
      };
    }

    case 'Protective Put': {
      const premium = op.otmPutPrice * 100;
      const protectedAt = op.otmPutStrike;
      return {
        maxLoss: `${fmt$(premium)} + decline to ${fmt$dec(protectedAt)}`,
        maxGain: 'Unlimited upside minus premium cost',
        riskRewardRatio: null,
        probabilityEstimate: 55,
        breakeven: `${fmt$dec(price + op.otmPutPrice)} (long stock + put cost)`,
        keyRiskFactors,
        managementTips: [
          'Use as insurance during uncertain markets, not as a permanent hedge',
          'Consider selling when volatility spikes to recoup premium',
          'Match expiration to your expected holding period',
        ],
      };
    }

    case 'Collar': {
      const putCost = op.otmPutPrice;
      const callCredit = op.otmCallPrice;
      const netCost = putCost - callCredit;
      return {
        maxLoss: `${fmt$dec(price - op.otmPutStrike + netCost)} per share`,
        maxGain: `${fmt$dec(op.otmCallStrike - price - netCost)} per share`,
        riskRewardRatio: null,
        probabilityEstimate: 60,
        breakeven: `${fmt$dec(price + netCost)}`,
        keyRiskFactors,
        managementTips: [
          'Ideal for protecting unrealized gains on existing positions',
          'Net cost is often near zero if IV is elevated',
          'Be prepared for shares to be called away at the call strike',
        ],
      };
    }

    case 'Iron Condor': {
      const callCredit = Math.max(0, op.otmCallPrice * 0.6);
      const putCredit = Math.max(0, op.otmPutPrice * 0.6);
      const totalCredit = callCredit + putCredit;
      const wingWidth = Math.round(price * 0.05);
      const maxLoss = Math.max(0, wingWidth - totalCredit);
      const rr = maxLoss > 0 ? totalCredit / maxLoss : 0;
      return {
        maxLoss: `${fmt$(maxLoss * 100)}`,
        maxGain: `${fmt$(totalCredit * 100)} (total credit)`,
        riskRewardRatio: Math.round(rr * 100) / 100,
        probabilityEstimate: 60,
        breakeven: `${fmt$dec(op.otmPutStrike - putCredit)} / ${fmt$dec(op.otmCallStrike + callCredit)}`,
        keyRiskFactors,
        managementTips: [
          'Close at 50% of max profit for best risk-adjusted return',
          'Close the untested side early to reduce margin and risk',
          'Avoid holding through last 2 weeks — gamma risk accelerates',
        ],
      };
    }

    case 'Calendar Spread': {
      const debit = op.atmCallPrice * 0.3; // approximate net debit (near/far differential)
      return {
        maxLoss: `${fmt$(debit * 100)} (net debit)`,
        maxGain: 'Variable — maximized if stock near strike at front expiration',
        riskRewardRatio: null,
        probabilityEstimate: 50,
        breakeven: `Near ${fmt$dec(op.atmStrike)} ± time value differential`,
        keyRiskFactors,
        managementTips: [
          'Best when IV is expected to rise or remain stable',
          'Close before front-month expiration to capture remaining time value',
          'Large directional moves are the main risk — acts as a neutral trade',
        ],
      };
    }

    case 'Covered Call': {
      const premium = op.otmCallPrice * 100;
      const be = price - op.otmCallPrice;
      return {
        maxLoss: `${fmt$(be * 100)} (if stock goes to $0)`,
        maxGain: `${fmt$((op.otmCallStrike - price + op.otmCallPrice) * 100)}`,
        riskRewardRatio: null,
        probabilityEstimate: 65,
        breakeven: `${fmt$dec(be)}`,
        keyRiskFactors,
        managementTips: [
          'Roll up and out if stock rallies through your call strike',
          'Let it expire worthless in flat/down markets to keep full premium',
          'Consistent income strategy — best for mildly bearish to flat outlook',
        ],
      };
    }

    case 'Bear Put Spread': {
      const debit = Math.max(0, op.atmPutPrice - op.otmPutPrice);
      const spreadWidth = op.atmStrike - op.otmPutStrike;
      const maxGain = Math.max(0, spreadWidth - debit);
      const be = op.atmStrike - debit;
      const rr = debit > 0 ? maxGain / debit : 0;
      const pop = spreadWidth > 0 ? Math.round((1 - debit / spreadWidth) * 100) : 50;
      return {
        maxLoss: `${fmt$(debit * 100)} (net debit)`,
        maxGain: `${fmt$(maxGain * 100)}`,
        riskRewardRatio: Math.round(rr * 100) / 100,
        probabilityEstimate: pop,
        breakeven: `${fmt$dec(be)}`,
        keyRiskFactors,
        managementTips: [
          'Close at 50-75% of max profit to lock in gains',
          'Cut losses at 50% of debit paid if reversal occurs',
          'Time decay works against you — manage before final 2 weeks',
        ],
      };
    }

    case 'Long Put': {
      const premium = op.atmPutPrice * 100;
      const be = op.atmStrike - op.atmPutPrice;
      return {
        maxLoss: `${fmt$(premium)} (premium paid)`,
        maxGain: `${fmt$(be * 100)} (if stock goes to $0)`,
        riskRewardRatio: null,
        probabilityEstimate: 45,
        breakeven: `${fmt$dec(be)}`,
        keyRiskFactors,
        managementTips: [
          'Consider taking profits at 50-100% of premium paid',
          'Cut losses if the option loses 50% of its value',
          'Roll to later expiration if thesis intact with 14 DTE remaining',
        ],
      };
    }

    case 'Straddle / Strangle': {
      const totalPremium = (op.atmCallPrice + op.atmPutPrice) * 100;
      const beUp = op.atmStrike + op.atmCallPrice + op.atmPutPrice;
      const beDown = op.atmStrike - op.atmCallPrice - op.atmPutPrice;
      return {
        maxLoss: `${fmt$(totalPremium)} (total premium paid)`,
        maxGain: 'Unlimited (either direction)',
        riskRewardRatio: null,
        probabilityEstimate: 35,
        breakeven: `${fmt$dec(beDown)} / ${fmt$dec(beUp)}`,
        keyRiskFactors,
        managementTips: [
          'Enter when IV is low and a catalyst is expected',
          'Close the profitable leg early if a strong move occurs',
          'Time decay is your biggest enemy — use shorter DTE or manage actively',
        ],
      };
    }

    default:
      return {
        maxLoss: 'Varies',
        maxGain: 'Varies',
        riskRewardRatio: null,
        probabilityEstimate: 50,
        breakeven: 'Varies by position',
        keyRiskFactors,
        managementTips: ['Review strategy-specific risk before entering'],
      };
  }
}
