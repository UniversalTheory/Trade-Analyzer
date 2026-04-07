import type { PriceBar, QuoteData, FundamentalsData, OptionsChainData } from '../api/types';
import { calcRSI, calcMACD, calcSMA } from './technicals';
import { analyzeIV } from './ivAnalysis';
import type { IVAnalysis } from './ivAnalysis';
import { calculateRisk } from './riskCalculations';
import type { RiskBreakdown } from './riskCalculations';

// ── Types ──

export type SignalCategory = 'technical' | 'fundamental' | 'volatility';

export interface Signal {
  label: string;
  category: SignalCategory;
  direction: 'bullish' | 'bearish' | 'neutral';
  reason: string;
  score: number;        // -1 to +1
  confidence: number;   // 0 to 1
}

export interface ScoringResult {
  signals: Signal[];
  compositeScore: number;
  confidence: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  signalAgreement: number;
}

export interface RecommendationReasoning {
  primary: string;
  supporting: string[];
  warnings: string[];
}

export interface IVContext {
  ivPercentile: number;
  ivRank: string;
  atmIV: number;
  ivImpact: string;
}

export interface Recommendation {
  strategy: string;
  type: 'bullish' | 'bearish' | 'neutral';
  risk: 'low' | 'medium' | 'high';
  confidence: number;
  reasoning: RecommendationReasoning;
  riskBreakdown?: RiskBreakdown;
  ivContext?: IVContext;
}

// ── Category weights ──

const CATEGORY_WEIGHTS: Record<SignalCategory, number> = {
  technical: 0.55,
  fundamental: 0.35,
  volatility: 0.10,
};

const QUALITY_THRESHOLD = 0.30;
const MAX_RECOMMENDATIONS = 6;

// ── Technical signals (6) ──

function buildTechnicalSignals(quote: QuoteData, bars: PriceBar[]): Signal[] {
  const signals: Signal[] = [];
  if (bars.length < 30) return signals;

  const closes = bars.map(b => b.close);
  const lastClose = closes[closes.length - 1];

  // RSI
  const rsi = calcRSI(bars, 14);
  if (rsi.length > 0) {
    const r = rsi[rsi.length - 1].value;
    let score: number, direction: Signal['direction'], reason: string;

    if (r >= 75) {
      score = -1; direction = 'bearish'; reason = `Strongly overbought (${r.toFixed(1)})`;
    } else if (r >= 65) {
      score = -0.5; direction = 'bearish'; reason = `Overbought territory (${r.toFixed(1)})`;
    } else if (r >= 55) {
      score = 0.3; direction = 'bullish'; reason = `Bullish momentum (${r.toFixed(1)})`;
    } else if (r >= 45) {
      score = 0; direction = 'neutral'; reason = `Neutral RSI (${r.toFixed(1)})`;
    } else if (r >= 35) {
      score = -0.3; direction = 'bearish'; reason = `Bearish momentum (${r.toFixed(1)})`;
    } else if (r >= 25) {
      score = 0.5; direction = 'bullish'; reason = `Oversold territory (${r.toFixed(1)})`;
    } else {
      score = 1; direction = 'bullish'; reason = `Strongly oversold (${r.toFixed(1)})`;
    }
    signals.push({ label: `RSI ${r.toFixed(1)}`, category: 'technical', direction, reason, score, confidence: 0.8 });
  }

  // MACD
  const macd = calcMACD(bars);
  if (macd.length >= 3) {
    const last = macd[macd.length - 1];
    const prev = macd[macd.length - 2];
    const prev2 = macd[macd.length - 3];

    const crossedUp = prev.macd < prev.signal && last.macd > last.signal;
    const crossedDown = prev.macd > prev.signal && last.macd < last.signal;
    const histGrowing = last.histogram > prev.histogram && prev.histogram > prev2.histogram;
    const histShrinking = last.histogram < prev.histogram && prev.histogram < prev2.histogram;
    const aboveSignal = last.macd > last.signal;

    let score: number, direction: Signal['direction'], reason: string;

    if (crossedUp) {
      score = 0.9; direction = 'bullish'; reason = 'Bullish MACD crossover';
    } else if (crossedDown) {
      score = -0.9; direction = 'bearish'; reason = 'Bearish MACD crossover';
    } else if (aboveSignal && histGrowing) {
      score = 0.7; direction = 'bullish'; reason = 'MACD above signal, histogram expanding';
    } else if (aboveSignal && histShrinking) {
      score = 0.2; direction = 'bullish'; reason = 'MACD above signal, momentum fading';
    } else if (!aboveSignal && histShrinking) {
      score = -0.7; direction = 'bearish'; reason = 'MACD below signal, histogram expanding negatively';
    } else if (!aboveSignal && histGrowing) {
      score = -0.2; direction = 'bearish'; reason = 'MACD below signal, downside momentum fading';
    } else {
      score = aboveSignal ? 0.4 : -0.4;
      direction = aboveSignal ? 'bullish' : 'bearish';
      reason = aboveSignal ? 'MACD above signal line' : 'MACD below signal line';
    }
    signals.push({ label: 'MACD', category: 'technical', direction, reason, score, confidence: 0.85 });
  }

  // SMA Trend
  const sma20 = calcSMA(bars, 20);
  const sma50 = calcSMA(bars, 50);
  if (sma20.length > 0) {
    const s20 = sma20[sma20.length - 1].value;
    const s50 = sma50.length > 0 ? sma50[sma50.length - 1].value : null;
    let score: number, direction: Signal['direction'], reason: string;

    if (s50 !== null) {
      if (lastClose > s20 && s20 > s50) {
        score = 0.8; direction = 'bullish'; reason = 'Price > SMA20 > SMA50 (uptrend)';
      } else if (lastClose > s20 && s20 < s50) {
        score = 0.2; direction = 'bullish'; reason = 'Price above SMA20, recovering toward SMA50';
      } else if (lastClose < s20 && s20 > s50) {
        score = -0.2; direction = 'bearish'; reason = 'Pullback below SMA20 within uptrend';
      } else {
        score = -0.8; direction = 'bearish'; reason = 'Price < SMA20 < SMA50 (downtrend)';
      }
    } else {
      score = lastClose > s20 ? 0.5 : -0.5;
      direction = lastClose > s20 ? 'bullish' : 'bearish';
      reason = lastClose > s20 ? `Price above SMA20 ($${s20.toFixed(2)})` : `Price below SMA20 ($${s20.toFixed(2)})`;
    }
    signals.push({ label: 'SMA Trend', category: 'technical', direction, reason, score, confidence: 0.75 });
  }

  // Short-term momentum
  if (closes.length >= 21) {
    const ret5 = (lastClose - closes[closes.length - 6]) / closes[closes.length - 6];
    const ret20 = (lastClose - closes[closes.length - 21]) / closes[closes.length - 21];
    const momentum = ret5 - ret20 / 4;
    let score: number, direction: Signal['direction'], reason: string;

    if (ret5 >= 0.03 && momentum > 0) {
      score = 0.7; direction = 'bullish'; reason = `Strong 5-day surge (+${(ret5 * 100).toFixed(1)}%)`;
    } else if (ret5 >= 0.01 && momentum > 0) {
      score = 0.3; direction = 'bullish'; reason = `Positive short-term momentum (+${(ret5 * 100).toFixed(1)}% / 5d)`;
    } else if (ret5 <= -0.03 && momentum < 0) {
      score = -0.7; direction = 'bearish'; reason = `Sharp 5-day decline (${(ret5 * 100).toFixed(1)}%)`;
    } else if (ret5 <= -0.01 && momentum < 0) {
      score = -0.3; direction = 'bearish'; reason = `Negative short-term momentum (${(ret5 * 100).toFixed(1)}% / 5d)`;
    } else {
      score = 0; direction = 'neutral'; reason = `Flat short-term (${(ret5 * 100).toFixed(1)}% / 5d)`;
    }
    signals.push({ label: 'Momentum', category: 'technical', direction, reason, score, confidence: 0.7 });
  }

  // 52-week position
  if (quote.week52High && quote.week52Low) {
    const range = quote.week52High - quote.week52Low;
    const pos = range > 0 ? (lastClose - quote.week52Low) / range : 0.5;
    let score: number, direction: Signal['direction'], reason: string;

    if (pos >= 0.9) {
      score = -0.7; direction = 'bearish'; reason = `Near 52W high — ${(pos * 100).toFixed(0)}% of range`;
    } else if (pos >= 0.7) {
      score = -0.2; direction = 'bearish'; reason = `Upper 52W range — ${(pos * 100).toFixed(0)}%`;
    } else if (pos >= 0.4) {
      score = 0.2; direction = 'bullish'; reason = `Mid-to-upper 52W range — ${(pos * 100).toFixed(0)}%`;
    } else if (pos >= 0.2) {
      score = 0; direction = 'neutral'; reason = `Mid-to-lower 52W range — ${(pos * 100).toFixed(0)}%`;
    } else if (pos >= 0.1) {
      score = 0.5; direction = 'bullish'; reason = `Near 52W low — ${(pos * 100).toFixed(0)}% of range`;
    } else {
      score = 0.8; direction = 'bullish'; reason = `At/near 52W low — ${(pos * 100).toFixed(0)}% of range`;
    }
    signals.push({ label: '52W Range', category: 'technical', direction, reason, score, confidence: 0.65 });
  }

  // Volume confirmation
  if (quote.volume && quote.avgVolume && quote.avgVolume > 0) {
    const ratio = quote.volume / quote.avgVolume;
    if (ratio >= 2.0) {
      const dir: Signal['direction'] = quote.changePercent >= 0 ? 'bullish' : 'bearish';
      const s = quote.changePercent >= 0 ? 0.6 : -0.6;
      signals.push({
        label: `Vol ×${ratio.toFixed(1)}`, category: 'technical', direction: dir,
        reason: `Heavy volume (${ratio.toFixed(1)}×) confirms ${dir} move`, score: s, confidence: 0.75,
      });
    } else if (ratio >= 1.4) {
      const dir: Signal['direction'] = quote.changePercent >= 0 ? 'bullish' : 'bearish';
      const s = quote.changePercent >= 0 ? 0.3 : -0.3;
      signals.push({
        label: `Vol ×${ratio.toFixed(1)}`, category: 'technical', direction: dir,
        reason: `Above-avg volume (${ratio.toFixed(1)}×) supporting move`, score: s, confidence: 0.6,
      });
    }
  }

  return signals;
}

// ── Fundamental signals (up to 7) ──

function buildFundamentalSignals(fundamentals?: FundamentalsData): Signal[] {
  if (!fundamentals) return [];
  const signals: Signal[] = [];

  // 1. Valuation composite
  const valMetrics: number[] = [];
  if (fundamentals.trailingPE != null) {
    if (fundamentals.trailingPE < 12) valMetrics.push(0.7);
    else if (fundamentals.trailingPE < 18) valMetrics.push(0.3);
    else if (fundamentals.trailingPE < 25) valMetrics.push(0);
    else if (fundamentals.trailingPE < 40) valMetrics.push(-0.3);
    else valMetrics.push(-0.6);
  }
  if (fundamentals.priceToBook != null) {
    if (fundamentals.priceToBook < 1.5) valMetrics.push(0.5);
    else if (fundamentals.priceToBook < 3) valMetrics.push(0.1);
    else if (fundamentals.priceToBook < 6) valMetrics.push(-0.2);
    else valMetrics.push(-0.5);
  }
  if (fundamentals.priceToSales != null) {
    if (fundamentals.priceToSales < 1) valMetrics.push(0.5);
    else if (fundamentals.priceToSales < 3) valMetrics.push(0.1);
    else if (fundamentals.priceToSales < 8) valMetrics.push(-0.2);
    else valMetrics.push(-0.5);
  }
  if (valMetrics.length > 0) {
    const avg = valMetrics.reduce((a, b) => a + b, 0) / valMetrics.length;
    const dir: Signal['direction'] = avg > 0.1 ? 'bullish' : avg < -0.1 ? 'bearish' : 'neutral';
    const peStr = fundamentals.trailingPE != null ? `P/E ${fundamentals.trailingPE.toFixed(1)}` : '';
    const pbStr = fundamentals.priceToBook != null ? `P/B ${fundamentals.priceToBook.toFixed(1)}` : '';
    const parts = [peStr, pbStr].filter(Boolean).join(', ');
    const reason = dir === 'bullish' ? `Attractive valuation (${parts})`
      : dir === 'bearish' ? `Stretched valuation (${parts})`
      : `Fair valuation (${parts})`;
    signals.push({ label: 'Valuation', category: 'fundamental', direction: dir, reason, score: avg, confidence: 0.7 });
  }

  // 2. Profitability
  const profMetrics: number[] = [];
  if (fundamentals.roe != null) {
    if (fundamentals.roe > 0.20) profMetrics.push(0.6);
    else if (fundamentals.roe > 0.10) profMetrics.push(0.3);
    else if (fundamentals.roe > 0) profMetrics.push(0);
    else profMetrics.push(-0.5);
  }
  if (fundamentals.netMargin != null) {
    if (fundamentals.netMargin > 0.15) profMetrics.push(0.5);
    else if (fundamentals.netMargin > 0.05) profMetrics.push(0.2);
    else if (fundamentals.netMargin > 0) profMetrics.push(0);
    else profMetrics.push(-0.4);
  }
  if (fundamentals.operatingMargin != null) {
    if (fundamentals.operatingMargin > 0.20) profMetrics.push(0.4);
    else if (fundamentals.operatingMargin > 0.10) profMetrics.push(0.2);
    else if (fundamentals.operatingMargin > 0) profMetrics.push(0);
    else profMetrics.push(-0.4);
  }
  if (profMetrics.length > 0) {
    const avg = profMetrics.reduce((a, b) => a + b, 0) / profMetrics.length;
    const dir: Signal['direction'] = avg > 0.1 ? 'bullish' : avg < -0.1 ? 'bearish' : 'neutral';
    const roeStr = fundamentals.roe != null ? `ROE ${(fundamentals.roe * 100).toFixed(1)}%` : '';
    const marginStr = fundamentals.netMargin != null ? `Net margin ${(fundamentals.netMargin * 100).toFixed(1)}%` : '';
    const parts = [roeStr, marginStr].filter(Boolean).join(', ');
    signals.push({
      label: 'Profitability', category: 'fundamental', direction: dir,
      reason: dir === 'bullish' ? `Strong profitability (${parts})` : dir === 'bearish' ? `Weak profitability (${parts})` : `Moderate profitability (${parts})`,
      score: avg, confidence: 0.7,
    });
  }

  // 3. Financial health
  const healthMetrics: number[] = [];
  if (fundamentals.debtToEquity != null) {
    if (fundamentals.debtToEquity < 0.5) healthMetrics.push(0.5);
    else if (fundamentals.debtToEquity < 1.0) healthMetrics.push(0.2);
    else if (fundamentals.debtToEquity < 2.0) healthMetrics.push(-0.2);
    else healthMetrics.push(-0.6);
  }
  if (fundamentals.currentRatio != null) {
    if (fundamentals.currentRatio > 2.0) healthMetrics.push(0.4);
    else if (fundamentals.currentRatio > 1.5) healthMetrics.push(0.2);
    else if (fundamentals.currentRatio > 1.0) healthMetrics.push(0);
    else healthMetrics.push(-0.5);
  }
  if (fundamentals.freeCashFlow != null) {
    healthMetrics.push(fundamentals.freeCashFlow > 0 ? 0.3 : -0.4);
  }
  if (healthMetrics.length > 0) {
    const avg = healthMetrics.reduce((a, b) => a + b, 0) / healthMetrics.length;
    const dir: Signal['direction'] = avg > 0.1 ? 'bullish' : avg < -0.1 ? 'bearish' : 'neutral';
    const deStr = fundamentals.debtToEquity != null ? `D/E ${fundamentals.debtToEquity.toFixed(1)}` : '';
    const crStr = fundamentals.currentRatio != null ? `CR ${fundamentals.currentRatio.toFixed(1)}` : '';
    const parts = [deStr, crStr].filter(Boolean).join(', ');
    signals.push({
      label: 'Financial Health', category: 'fundamental', direction: dir,
      reason: dir === 'bullish' ? `Healthy balance sheet (${parts})` : dir === 'bearish' ? `Weak balance sheet (${parts})` : `Adequate balance sheet (${parts})`,
      score: avg, confidence: 0.65,
    });
  }

  // 4. Growth
  const growthMetrics: number[] = [];
  if (fundamentals.revenueGrowth != null) {
    if (fundamentals.revenueGrowth > 0.20) growthMetrics.push(0.7);
    else if (fundamentals.revenueGrowth > 0.10) growthMetrics.push(0.4);
    else if (fundamentals.revenueGrowth > 0) growthMetrics.push(0.1);
    else if (fundamentals.revenueGrowth > -0.10) growthMetrics.push(-0.2);
    else growthMetrics.push(-0.6);
  }
  if (fundamentals.earningsGrowth != null) {
    if (fundamentals.earningsGrowth > 0.20) growthMetrics.push(0.7);
    else if (fundamentals.earningsGrowth > 0.10) growthMetrics.push(0.4);
    else if (fundamentals.earningsGrowth > 0) growthMetrics.push(0.1);
    else if (fundamentals.earningsGrowth > -0.10) growthMetrics.push(-0.2);
    else growthMetrics.push(-0.6);
  }
  if (growthMetrics.length > 0) {
    const avg = growthMetrics.reduce((a, b) => a + b, 0) / growthMetrics.length;
    const dir: Signal['direction'] = avg > 0.1 ? 'bullish' : avg < -0.1 ? 'bearish' : 'neutral';
    const revStr = fundamentals.revenueGrowth != null ? `Rev ${(fundamentals.revenueGrowth * 100).toFixed(1)}%` : '';
    const earnStr = fundamentals.earningsGrowth != null ? `EPS ${(fundamentals.earningsGrowth * 100).toFixed(1)}%` : '';
    const parts = [revStr, earnStr].filter(Boolean).join(', ');
    signals.push({
      label: 'Growth', category: 'fundamental', direction: dir,
      reason: dir === 'bullish' ? `Strong growth trajectory (${parts})` : dir === 'bearish' ? `Declining growth (${parts})` : `Moderate growth (${parts})`,
      score: avg, confidence: 0.75,
    });
  }

  // 5. Short interest
  if (fundamentals.shortPercentFloat != null) {
    const si = fundamentals.shortPercentFloat;
    let score: number, direction: Signal['direction'], reason: string;
    if (si > 0.20) {
      score = -0.6; direction = 'bearish'; reason = `Very high short interest (${(si * 100).toFixed(1)}% float) — bearish pressure + squeeze risk`;
    } else if (si > 0.10) {
      score = -0.3; direction = 'bearish'; reason = `Elevated short interest (${(si * 100).toFixed(1)}% float)`;
    } else if (si > 0.05) {
      score = -0.1; direction = 'neutral'; reason = `Moderate short interest (${(si * 100).toFixed(1)}% float)`;
    } else {
      score = 0.1; direction = 'neutral'; reason = `Low short interest (${(si * 100).toFixed(1)}% float)`;
    }
    signals.push({ label: 'Short Interest', category: 'fundamental', direction, reason, score, confidence: 0.6 });
  }

  // 6. Analyst consensus
  if (fundamentals.targetMean != null && fundamentals.recommendation) {
    const upside = fundamentals.targetMean > 0
      ? ((fundamentals.targetMean - (fundamentals.marketCap ? 0 : 0)) / fundamentals.targetMean) // we need current price, but we don't have it here
      : 0;
    // We'll compute upside from the recommendation + target in relation to what analysts say
    const rec = fundamentals.recommendation.toLowerCase();
    let score: number, direction: Signal['direction'], reason: string;

    if (rec.includes('strong_buy') || rec === 'strongbuy') {
      score = 0.6; direction = 'bullish';
    } else if (rec.includes('buy')) {
      score = 0.4; direction = 'bullish';
    } else if (rec.includes('hold') || rec === 'neutral') {
      score = 0; direction = 'neutral';
    } else if (rec.includes('sell') || rec.includes('under')) {
      score = -0.5; direction = 'bearish';
    } else {
      score = 0; direction = 'neutral';
    }
    reason = `Analyst consensus: ${rec.replace('_', ' ')}`;
    if (fundamentals.analystCount) reason += ` (${fundamentals.analystCount} analysts)`;
    if (fundamentals.targetMean) reason += ` · Target $${fundamentals.targetMean.toFixed(2)}`;

    const conf = fundamentals.analystCount && fundamentals.analystCount >= 10 ? 0.7 : fundamentals.analystCount && fundamentals.analystCount >= 3 ? 0.5 : 0.3;
    signals.push({ label: 'Analyst', category: 'fundamental', direction, reason, score, confidence: conf });
  }

  return signals;
}

// ── Volatility signals ──

function buildVolatilitySignals(fundamentals?: FundamentalsData, ivData?: IVAnalysis | null): Signal[] {
  const signals: Signal[] = [];

  // Beta
  if (fundamentals?.beta != null) {
    const b = fundamentals.beta;
    let score: number, direction: Signal['direction'], reason: string;

    if (b > 1.8) {
      score = -0.3; direction = 'bearish'; reason = `Very high beta (${b.toFixed(2)}) — expect amplified moves`;
    } else if (b > 1.3) {
      score = -0.1; direction = 'neutral'; reason = `Elevated beta (${b.toFixed(2)}) — above-average volatility`;
    } else if (b > 0.8) {
      score = 0.1; direction = 'neutral'; reason = `Normal beta (${b.toFixed(2)})`;
    } else if (b > 0.5) {
      score = 0.2; direction = 'bullish'; reason = `Low beta (${b.toFixed(2)}) — defensive, lower volatility`;
    } else {
      score = 0.2; direction = 'neutral'; reason = `Very low beta (${b.toFixed(2)}) — minimal market correlation`;
    }
    signals.push({ label: `Beta ${b.toFixed(2)}`, category: 'volatility', direction, reason, score, confidence: 0.6 });
  }

  // IV Level (from options chain analysis)
  if (ivData) {
    const pct = ivData.ivPercentileEstimate;
    const ivPctStr = `${(ivData.atmIV * 100).toFixed(1)}%`;
    let score: number, direction: Signal['direction'], reason: string;

    if (pct >= 80) {
      score = -0.2; direction = 'neutral'; reason = `IV elevated (~${pct}th pct, ATM ${ivPctStr}) — premiums expensive, favor selling`;
    } else if (pct >= 60) {
      score = -0.1; direction = 'neutral'; reason = `IV above average (~${pct}th pct, ATM ${ivPctStr})`;
    } else if (pct >= 40) {
      score = 0; direction = 'neutral'; reason = `IV near average (~${pct}th pct, ATM ${ivPctStr})`;
    } else if (pct >= 20) {
      score = 0.1; direction = 'neutral'; reason = `IV below average (~${pct}th pct, ATM ${ivPctStr}) — premiums cheap`;
    } else {
      score = 0.2; direction = 'neutral'; reason = `IV low (~${pct}th pct, ATM ${ivPctStr}) — premiums cheap, favor buying`;
    }
    signals.push({ label: `IV ~${pct}th`, category: 'volatility', direction, reason, score, confidence: 0.65 });

    // Put/Call OI Ratio sentiment
    const pcr = ivData.putCallOIRatio;
    if (pcr > 1.5) {
      signals.push({
        label: `P/C ${pcr.toFixed(2)}`, category: 'volatility', direction: 'bearish',
        reason: `Heavy put positioning (P/C OI ${pcr.toFixed(2)}) — elevated hedging or bearish sentiment`,
        score: -0.3, confidence: 0.55,
      });
    } else if (pcr > 1.2) {
      signals.push({
        label: `P/C ${pcr.toFixed(2)}`, category: 'volatility', direction: 'bearish',
        reason: `Above-normal put/call ratio (${pcr.toFixed(2)}) — mildly bearish sentiment`,
        score: -0.15, confidence: 0.5,
      });
    } else if (pcr < 0.6) {
      signals.push({
        label: `P/C ${pcr.toFixed(2)}`, category: 'volatility', direction: 'bullish',
        reason: `Low put/call ratio (${pcr.toFixed(2)}) — bullish positioning`,
        score: 0.2, confidence: 0.5,
      });
    } else if (pcr < 0.8) {
      signals.push({
        label: `P/C ${pcr.toFixed(2)}`, category: 'volatility', direction: 'bullish',
        reason: `Below-normal put/call ratio (${pcr.toFixed(2)}) — mildly bullish sentiment`,
        score: 0.1, confidence: 0.5,
      });
    }
  }

  return signals;
}

// ── Composite scoring ──

export function scoreSignals(
  quote: QuoteData,
  bars: PriceBar[],
  fundamentals?: FundamentalsData,
  optionsChain?: OptionsChainData,
): ScoringResult & { ivAnalysis?: IVAnalysis | null } {
  const technical = buildTechnicalSignals(quote, bars);
  const fundamental = buildFundamentalSignals(fundamentals);

  // IV analysis from options chain
  const ivData = optionsChain ? analyzeIV(optionsChain, quote.price, bars) : null;
  const volatility = buildVolatilitySignals(fundamentals, ivData);
  const signals = [...technical, ...fundamental, ...volatility];

  if (signals.length === 0) {
    return { signals, compositeScore: 0, confidence: 0, bullishCount: 0, bearishCount: 0, neutralCount: 0, signalAgreement: 0 };
  }

  // Category-level scoring: average within each category, then weighted sum
  const categories = new Map<SignalCategory, Signal[]>();
  for (const s of signals) {
    if (!categories.has(s.category)) categories.set(s.category, []);
    categories.get(s.category)!.push(s);
  }

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [cat, sigs] of categories) {
    const catAvg = sigs.reduce((sum, s) => sum + s.score, 0) / sigs.length;
    const weight = CATEGORY_WEIGHTS[cat];
    weightedSum += catAvg * weight;
    totalWeight += weight;
  }
  const compositeScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Signal agreement: 1 = all same direction, 0 = max disagreement
  const scores = signals.map(s => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
  const stdev = Math.sqrt(variance);
  const signalAgreement = Math.max(0, 1 - stdev); // stdev of [-1,1] scores maxes ~1

  const bullishCount = signals.filter(s => s.direction === 'bullish').length;
  const bearishCount = signals.filter(s => s.direction === 'bearish').length;
  const neutralCount = signals.filter(s => s.direction === 'neutral').length;

  const avgConfidence = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;

  return {
    signals,
    compositeScore,
    confidence: avgConfidence * (0.5 + 0.5 * signalAgreement), // agreement boosts overall confidence
    bullishCount,
    bearishCount,
    neutralCount,
    signalAgreement,
    ivAnalysis: ivData,
  };
}

// ── Strategy candidates ──

interface StrategyCandidate {
  strategy: string;
  type: 'bullish' | 'bearish' | 'neutral';
  risk: 'low' | 'medium' | 'high';
  minScore: number;
  maxScore: number;
  requiresHighBeta?: boolean;
  requiresLowAgreement?: boolean;
  description: string; // base strategy description for reasoning
}

const STRATEGIES: StrategyCandidate[] = [
  {
    strategy: 'Long Call', type: 'bullish', risk: 'medium',
    minScore: 0.30, maxScore: 1.0,
    description: 'leveraged upside exposure with capped downside risk',
  },
  {
    strategy: 'Bull Call Spread', type: 'bullish', risk: 'low',
    minScore: 0.10, maxScore: 1.0,
    description: 'defined-risk bullish trade with lower premium than a naked call',
  },
  {
    strategy: 'Put Credit Spread', type: 'bullish', risk: 'low',
    minScore: 0.05, maxScore: 0.60,
    description: 'collect premium by selling a put spread below current price',
  },
  {
    strategy: 'Cash-Secured Put', type: 'bullish', risk: 'medium',
    minScore: 0.05, maxScore: 0.55,
    description: 'sell an OTM put to collect premium; worst case acquire shares at a discount',
  },
  {
    strategy: 'Protective Put', type: 'bullish', risk: 'low',
    minScore: 0.15, maxScore: 1.0, requiresHighBeta: true,
    description: 'insure existing long exposure against downside while maintaining upside',
  },
  {
    strategy: 'Collar', type: 'bullish', risk: 'low',
    minScore: 0.05, maxScore: 0.45, requiresHighBeta: true,
    description: 'cap both upside and downside with a put + covered call combination',
  },
  {
    strategy: 'Iron Condor', type: 'neutral', risk: 'low',
    minScore: -0.20, maxScore: 0.20,
    description: 'sell OTM call and put spreads to profit from range-bound price action and time decay',
  },
  {
    strategy: 'Calendar Spread', type: 'neutral', risk: 'low',
    minScore: -0.25, maxScore: 0.25,
    description: 'sell near-term, buy longer-dated at same strike to capture time decay differential',
  },
  {
    strategy: 'Covered Call', type: 'bearish', risk: 'low',
    minScore: -0.40, maxScore: 0.10,
    description: 'generate income on existing shares by selling upside calls',
  },
  {
    strategy: 'Bear Put Spread', type: 'bearish', risk: 'low',
    minScore: -1.0, maxScore: -0.10,
    description: 'defined-risk bearish trade with lower premium than a naked put',
  },
  {
    strategy: 'Long Put', type: 'bearish', risk: 'medium',
    minScore: -1.0, maxScore: -0.30,
    description: 'leveraged downside exposure with capped upside risk',
  },
  {
    strategy: 'Straddle / Strangle', type: 'neutral', risk: 'medium',
    minScore: -0.15, maxScore: 0.15, requiresLowAgreement: true,
    description: 'profit from a large move in either direction when signals conflict',
  },
];

// ── Recommendation generation ──

function computeCandidateConfidence(
  candidate: StrategyCandidate,
  result: ScoringResult,
): number {
  const { compositeScore, signalAgreement, confidence } = result;

  // Base: how centered is the score within this strategy's range?
  const rangeCenter = (candidate.minScore + candidate.maxScore) / 2;
  const rangeWidth = candidate.maxScore - candidate.minScore;
  const distFromCenter = Math.abs(compositeScore - rangeCenter);
  const fitScore = Math.max(0, 1 - (distFromCenter / (rangeWidth / 2)));

  // Agreement modifier
  let agreementMod = 0;
  if (candidate.requiresLowAgreement) {
    // Straddle benefits from disagreement
    agreementMod = (1 - signalAgreement) * 0.2;
  } else {
    // Directional strategies benefit from agreement
    agreementMod = signalAgreement * 0.15;
  }

  // Direction alignment: how many signals agree with the strategy direction?
  let directionBonus = 0;
  if (candidate.type === 'bullish') {
    directionBonus = (result.bullishCount / Math.max(1, result.signals.length)) * 0.15;
  } else if (candidate.type === 'bearish') {
    directionBonus = (result.bearishCount / Math.max(1, result.signals.length)) * 0.15;
  } else {
    // Neutral strategies benefit from balanced signals
    const balance = 1 - Math.abs(result.bullishCount - result.bearishCount) / Math.max(1, result.signals.length);
    directionBonus = balance * 0.1;
  }

  return Math.min(1, Math.max(0, fitScore * 0.5 + confidence * 0.2 + agreementMod + directionBonus));
}

function selectSupportingSignals(
  signals: Signal[],
  strategyType: 'bullish' | 'bearish' | 'neutral',
  max: number,
): Signal[] {
  const sorted = [...signals].sort((a, b) => {
    if (strategyType === 'bullish') return b.score - a.score;
    if (strategyType === 'bearish') return a.score - b.score;
    return Math.abs(a.score) - Math.abs(b.score); // neutral prefers low-magnitude
  });

  return sorted
    .filter(s => {
      if (strategyType === 'bullish') return s.score > 0;
      if (strategyType === 'bearish') return s.score < 0;
      return Math.abs(s.score) < 0.4;
    })
    .slice(0, max);
}

function selectWarningSignals(
  signals: Signal[],
  strategyType: 'bullish' | 'bearish' | 'neutral',
  max: number,
): Signal[] {
  return signals
    .filter(s => {
      if (strategyType === 'bullish') return s.score < -0.2;
      if (strategyType === 'bearish') return s.score > 0.2;
      return Math.abs(s.score) > 0.5; // neutral warns on strong directional signals
    })
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, max);
}

function buildReasoning(
  candidate: StrategyCandidate,
  result: ScoringResult,
  fundamentals?: FundamentalsData,
): RecommendationReasoning {
  const { compositeScore, signals, bullishCount, bearishCount, signalAgreement } = result;

  // Primary rationale
  const strength = Math.abs(compositeScore) >= 0.4 ? 'Strong' : Math.abs(compositeScore) >= 0.2 ? 'Moderate' : 'Mild';
  const bias = compositeScore > 0.1 ? 'bullish' : compositeScore < -0.1 ? 'bearish' : 'neutral';
  const agreementStr = signalAgreement > 0.7 ? 'with high signal convergence' : signalAgreement > 0.4 ? 'with moderate signal agreement' : 'amid mixed signals';

  let primary: string;
  if (candidate.type === 'neutral' && candidate.requiresLowAgreement) {
    primary = `Conflicting signals (${bullishCount} bullish, ${bearishCount} bearish) suggest a significant move is likely but direction is unclear. A ${candidate.strategy.toLowerCase()} ${candidate.description}.`;
  } else if (candidate.type === 'neutral') {
    primary = `${strength} neutral bias ${agreementStr}. A ${candidate.strategy.toLowerCase()} ${candidate.description}.`;
  } else {
    primary = `${strength} ${bias} bias ${agreementStr}. A ${candidate.strategy.toLowerCase()} offers ${candidate.description}.`;
  }

  // Add fundamental context if available
  if (fundamentals) {
    if (candidate.type === 'bullish' && fundamentals.targetMean) {
      const currentPE = fundamentals.trailingPE;
      if (currentPE != null && currentPE < 15) {
        primary += ` Valuation remains attractive at ${currentPE.toFixed(1)}x earnings.`;
      }
    }
    if (candidate.type === 'bearish' && fundamentals.trailingPE != null && fundamentals.trailingPE > 35) {
      primary += ` Stretched valuation at ${fundamentals.trailingPE.toFixed(1)}x earnings adds downside risk.`;
    }
    if (candidate.requiresHighBeta && fundamentals.beta != null) {
      primary += ` Beta of ${fundamentals.beta.toFixed(2)} justifies protective positioning.`;
    }
  }

  // Supporting signals
  const supporting = selectSupportingSignals(signals, candidate.type, 3)
    .map(s => s.reason);

  // Warning signals
  const warningSignals = selectWarningSignals(signals, candidate.type, 2);
  const warnings = warningSignals.map(s => s.reason);

  // Add fundamental risk warnings
  if (fundamentals) {
    if (fundamentals.debtToEquity != null && fundamentals.debtToEquity > 2.0) {
      warnings.push(`Elevated leverage (D/E ${fundamentals.debtToEquity.toFixed(1)}) increases downside risk`);
    }
    if (fundamentals.shortPercentFloat != null && fundamentals.shortPercentFloat > 0.15) {
      warnings.push(`High short interest (${(fundamentals.shortPercentFloat * 100).toFixed(1)}%) — expect volatile moves`);
    }
  }

  return { primary, supporting, warnings: warnings.slice(0, 3) };
}

// IV regime confidence adjustments
const IV_FAVORED: Record<string, string[]> = {
  high: ['Iron Condor', 'Cash-Secured Put', 'Covered Call', 'Put Credit Spread', 'Calendar Spread', 'Collar'],
  low: ['Long Call', 'Long Put', 'Bull Call Spread', 'Bear Put Spread', 'Straddle / Strangle', 'Protective Put'],
};

export function buildRecommendations(
  result: ScoringResult & { ivAnalysis?: IVAnalysis | null },
  quote: QuoteData,
  fundamentals?: FundamentalsData,
  optionsChain?: OptionsChainData,
): Recommendation[] {
  if (result.signals.length === 0) return [];

  const beta = fundamentals?.beta ?? 1.0;
  const hasHighBeta = beta > 1.3;
  const ivData = result.ivAnalysis;

  const candidates = STRATEGIES
    .filter(s => {
      if (result.compositeScore < s.minScore || result.compositeScore > s.maxScore) return false;
      if (s.requiresHighBeta && !hasHighBeta) return false;
      if (s.requiresLowAgreement && result.signalAgreement > 0.5) return false;
      return true;
    })
    .map(s => {
      let confidence = computeCandidateConfidence(s, result);

      // IV regime adjustments
      if (ivData) {
        const isHighIV = ivData.ivPercentileEstimate >= 70;
        const isLowIV = ivData.ivPercentileEstimate <= 30;

        if (isHighIV && IV_FAVORED.high.includes(s.strategy)) {
          confidence += 0.12;
        } else if (isHighIV && IV_FAVORED.low.includes(s.strategy)) {
          confidence -= 0.12;
        } else if (isLowIV && IV_FAVORED.low.includes(s.strategy)) {
          confidence += 0.12;
        } else if (isLowIV && IV_FAVORED.high.includes(s.strategy)) {
          confidence -= 0.12;
        }
        confidence = Math.min(1, Math.max(0, confidence));
      }

      return { ...s, confidence, reasoning: buildReasoning(s, result, fundamentals) };
    })
    .filter(s => s.confidence >= QUALITY_THRESHOLD)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_RECOMMENDATIONS);

  return candidates.map(c => {
    // Build risk breakdown
    const riskBreakdown = calculateRisk(c.strategy, quote, optionsChain, fundamentals, ivData ?? undefined);

    // Build IV context
    let ivContext: IVContext | undefined;
    if (ivData) {
      const isHighIV = ivData.ivPercentileEstimate >= 70;
      const isLowIV = ivData.ivPercentileEstimate <= 30;
      const favorsThis = (isHighIV && IV_FAVORED.high.includes(c.strategy))
        || (isLowIV && IV_FAVORED.low.includes(c.strategy));
      const againstThis = (isHighIV && IV_FAVORED.low.includes(c.strategy))
        || (isLowIV && IV_FAVORED.high.includes(c.strategy));

      let ivImpact: string;
      if (favorsThis && isHighIV) {
        ivImpact = 'Elevated IV favors this premium-selling strategy — richer credits available';
      } else if (favorsThis && isLowIV) {
        ivImpact = 'Low IV favors this premium-buying strategy — cheaper entry cost';
      } else if (againstThis && isHighIV) {
        ivImpact = 'Elevated IV makes this buying strategy more expensive — consider alternatives';
      } else if (againstThis && isLowIV) {
        ivImpact = 'Low IV reduces premium income — selling strategies offer less edge';
      } else {
        ivImpact = 'IV is in normal range — strategy selection is neutral on volatility';
      }

      ivContext = {
        ivPercentile: ivData.ivPercentileEstimate,
        ivRank: ivData.ivRank,
        atmIV: ivData.atmIV,
        ivImpact,
      };
    }

    return {
      strategy: c.strategy,
      type: c.type,
      risk: c.risk,
      confidence: c.confidence,
      reasoning: c.reasoning,
      riskBreakdown,
      ivContext,
    };
  });
}

// ── Trade summary ──
//
// Generates a 1–3 sentence plain-language overview of the current analysis.
// Structured for easy replacement with an async AI-generated version in Phase 6.
// Inputs mirror what a Claude API call would receive; return type stays `string`.

export function generateTradesSummary(
  symbol: string,
  result: ScoringResult & { ivAnalysis?: IVAnalysis | null },
  recs: Recommendation[],
  fundamentals?: FundamentalsData,
): string {
  const { compositeScore, confidence, bullishCount, bearishCount, neutralCount, signalAgreement, ivAnalysis } = result;

  const totalSignals = bullishCount + bearishCount + neutralCount;
  if (totalSignals === 0) return `Insufficient data to analyze ${symbol} at this time.`;

  // ── Sentence 1: overall sentiment + signal picture ──
  const sentimentWord =
    compositeScore >= 0.35 ? 'strongly bullish'
    : compositeScore >= 0.15 ? 'moderately bullish'
    : compositeScore <= -0.35 ? 'strongly bearish'
    : compositeScore <= -0.15 ? 'moderately bearish'
    : 'mixed / neutral';

  const confPct = Math.round(confidence * 100);
  const agreementPct = Math.round(signalAgreement * 100);
  const dominantCount = compositeScore >= 0 ? bullishCount : bearishCount;
  const dominantWord = compositeScore >= 0 ? 'bullish' : 'bearish';

  const s1 = `${symbol} is currently reading ${sentimentWord} — ${dominantCount} of ${totalSignals} signals are ${dominantWord} with ${agreementPct}% agreement at ${confPct}% confidence.`;

  // ── Sentence 2: key drivers ──
  const techSignals = result.signals.filter(s => s.category === 'technical').sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const fundSignals = result.signals.filter(s => s.category === 'fundamental').sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const drivers: string[] = [];

  if (techSignals.length > 0) {
    const top = techSignals[0];
    drivers.push(`${top.direction} technicals (${top.label}: ${top.reason.toLowerCase()})`);
  }

  if (fundSignals.length > 0) {
    const top = fundSignals[0];
    drivers.push(`${top.direction} fundamentals (${top.reason.toLowerCase()})`);
  }

  if (ivAnalysis) {
    const ivPct = ivAnalysis.ivPercentileEstimate;
    const ivLabel = ivPct >= 70 ? 'elevated IV' : ivPct <= 30 ? 'compressed IV' : 'neutral IV';
    drivers.push(`${ivLabel} at ~${ivPct}th percentile`);
  }

  const s2 = drivers.length > 0
    ? `Key drivers include ${drivers.join(', ')}.`
    : '';

  // ── Sentence 3: rec rationale or no-rec explanation ──
  let s3 = '';
  if (recs.length === 0) {
    if (signalAgreement < 0.45) {
      s3 = `Signals are too conflicted to generate a high-confidence trade — consider waiting for clearer direction.`;
    } else {
      s3 = `Signal strength is below the confidence threshold — no trade is recommended at this time.`;
    }
  } else {
    const types = [...new Set(recs.map(r => r.type))];
    const strategies = recs.slice(0, 2).map(r => r.strategy).join(' and ');
    const ivContext = ivAnalysis
      ? ivAnalysis.ivPercentileEstimate >= 70
        ? 'high IV favors premium-selling strategies'
        : ivAnalysis.ivPercentileEstimate <= 30
          ? 'low IV favors buying premium'
          : null
      : null;

    const recSentence = types.length === 1
      ? `The ${types[0]} bias supports strategies like ${strategies}`
      : `The mixed bias supports strategies like ${strategies}`;

    s3 = ivContext ? `${recSentence}; ${ivContext}.` : `${recSentence}.`;
  }

  return [s1, s2, s3].filter(Boolean).join(' ');
}
