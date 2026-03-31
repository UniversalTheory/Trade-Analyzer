import type { PriceBar, QuoteData } from '../api/types';

// ── Technical helpers ──────────────────────────────────────────────

export function calcSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(-(period + 1)).map((c, i, arr) =>
    i === 0 ? 0 : c - arr[i - 1]
  ).slice(1);

  const gains = changes.map(c => (c > 0 ? c : 0));
  const losses = changes.map(c => (c < 0 ? Math.abs(c) : 0));

  const avgGain = gains.reduce((a, b) => a + b, 0) / period;
  const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ── Relative strength vs SPY ───────────────────────────────────────

export function calcRelativeStrength(
  sectorBars: PriceBar[],
  spyBars: PriceBar[],
): number | null {
  if (sectorBars.length < 2 || spyBars.length < 2) return null;

  const sectorStart = sectorBars[0].close;
  const sectorEnd   = sectorBars[sectorBars.length - 1].close;
  const spyStart    = spyBars[0].close;
  const spyEnd      = spyBars[spyBars.length - 1].close;

  if (sectorStart === 0 || spyStart === 0) return null;

  const sectorReturn = (sectorEnd - sectorStart) / sectorStart;
  const spyReturn    = (spyEnd - spyStart) / spyStart;

  // Positive = outperforming, negative = underperforming
  return (sectorReturn - spyReturn) * 100;
}

// ── Risk / Opportunity Score (1–10) ───────────────────────────────

export interface SectorScore {
  opportunityScore: number; // 1–10 (higher = more opportunity)
  riskScore: number;        // 1–10 (higher = more risk)
  trendDirection: 'bullish' | 'bearish' | 'neutral';
  momentumStrength: 'strong' | 'moderate' | 'weak';
  rsi: number | null;
  sma20: number | null;
  sma50: number | null;
  relativeStrength: number | null; // vs SPY, in percentage points
  factors: ScoreFactor[];
}

interface ScoreFactor {
  label: string;
  contribution: 'positive' | 'negative' | 'neutral';
  detail: string;
}

export function calcSectorScore(
  quote: QuoteData,
  history: PriceBar[],
  spyHistory: PriceBar[],
): SectorScore {
  const closes = history.map(b => b.close);
  const rsi    = calcRSI(closes);
  const sma20  = calcSMA(closes, 20);
  const sma50  = calcSMA(closes, 50);
  const rs     = calcRelativeStrength(history, spyHistory);

  const price  = quote.price;
  const factors: ScoreFactor[] = [];

  let oppScore  = 5;  // Start neutral
  let riskScore = 5;

  // ── Trend vs moving averages ──
  if (sma20 !== null && sma50 !== null) {
    const aboveBoth = price > sma20 && price > sma50;
    const belowBoth = price < sma20 && price < sma50;

    if (aboveBoth) {
      oppScore  += 1.5;
      riskScore -= 0.5;
      factors.push({ label: 'Price above 20 & 50 MA', contribution: 'positive', detail: `$${price.toFixed(2)} > SMA20 $${sma20.toFixed(2)} & SMA50 $${sma50.toFixed(2)}` });
    } else if (belowBoth) {
      oppScore  -= 1.5;
      riskScore += 1.5;
      factors.push({ label: 'Price below 20 & 50 MA', contribution: 'negative', detail: `$${price.toFixed(2)} < SMA20 $${sma20.toFixed(2)} & SMA50 $${sma50.toFixed(2)}` });
    } else {
      factors.push({ label: 'Mixed MA signals', contribution: 'neutral', detail: 'Price between key moving averages' });
    }
  }

  // ── RSI ──
  if (rsi !== null) {
    if (rsi < 30) {
      oppScore  += 2;
      riskScore -= 0.5;
      factors.push({ label: 'RSI Oversold', contribution: 'positive', detail: `RSI ${rsi.toFixed(1)} — potential reversal zone` });
    } else if (rsi < 45) {
      oppScore  += 0.5;
      factors.push({ label: 'RSI Weak momentum', contribution: 'neutral', detail: `RSI ${rsi.toFixed(1)} — below midline` });
    } else if (rsi > 70) {
      oppScore  -= 1;
      riskScore += 2;
      factors.push({ label: 'RSI Overbought', contribution: 'negative', detail: `RSI ${rsi.toFixed(1)} — elevated, watch for pullback` });
    } else if (rsi > 55) {
      oppScore  += 1;
      factors.push({ label: 'RSI Healthy', contribution: 'positive', detail: `RSI ${rsi.toFixed(1)} — strong momentum without being overbought` });
    } else {
      factors.push({ label: 'RSI Neutral', contribution: 'neutral', detail: `RSI ${rsi.toFixed(1)} — mid-range` });
    }
  }

  // ── Relative strength vs SPY ──
  if (rs !== null) {
    if (rs > 3) {
      oppScore  += 1.5;
      riskScore -= 0.5;
      factors.push({ label: 'Outperforming SPY', contribution: 'positive', detail: `+${rs.toFixed(1)}pp above SPY — sector leadership` });
    } else if (rs > 0) {
      oppScore  += 0.5;
      factors.push({ label: 'Slightly outperforming SPY', contribution: 'positive', detail: `+${rs.toFixed(1)}pp above SPY` });
    } else if (rs < -3) {
      oppScore  -= 1.5;
      riskScore += 1;
      factors.push({ label: 'Underperforming SPY', contribution: 'negative', detail: `${rs.toFixed(1)}pp below SPY — sector weakness` });
    } else {
      factors.push({ label: 'In line with SPY', contribution: 'neutral', detail: `${rs.toFixed(1)}pp vs SPY` });
    }
  }

  // ── Today's momentum ──
  const dayChange = quote.changePercent;
  if (dayChange > 2) {
    oppScore  += 0.5;
    factors.push({ label: 'Strong day', contribution: 'positive', detail: `Up ${dayChange.toFixed(2)}% today` });
  } else if (dayChange < -2) {
    riskScore += 0.5;
    factors.push({ label: 'Weak day', contribution: 'negative', detail: `Down ${Math.abs(dayChange).toFixed(2)}% today` });
  }

  // ── Clamp to 1–10 ──
  oppScore  = Math.max(1, Math.min(10, Math.round(oppScore * 10) / 10));
  riskScore = Math.max(1, Math.min(10, Math.round(riskScore * 10) / 10));

  // ── Trend direction ──
  const trendDirection =
    (sma20 !== null && sma50 !== null && price > sma20 && sma20 > sma50)
      ? 'bullish'
      : (sma20 !== null && sma50 !== null && price < sma20 && sma20 < sma50)
      ? 'bearish'
      : 'neutral';

  // ── Momentum strength ──
  const absChange = Math.abs(dayChange);
  const momentumStrength =
    absChange > 2 ? 'strong' : absChange > 0.5 ? 'moderate' : 'weak';

  return {
    opportunityScore: oppScore,
    riskScore,
    trendDirection,
    momentumStrength,
    rsi,
    sma20,
    sma50,
    relativeStrength: rs,
    factors,
  };
}
