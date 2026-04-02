import type { PriceBar } from '../api/types';

export interface OHLCPoint {
  time: number; // unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LinePoint {
  time: number;
  value: number;
}

export function toOHLC(bars: PriceBar[]): OHLCPoint[] {
  return bars.map(b => ({
    time: Math.floor(new Date(b.date).getTime() / 1000),
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

export function calcSMA(bars: PriceBar[], period: number): LinePoint[] {
  const result: LinePoint[] = [];
  for (let i = period - 1; i < bars.length; i++) {
    const slice = bars.slice(i - period + 1, i + 1);
    const avg = slice.reduce((s, b) => s + b.close, 0) / period;
    result.push({
      time: Math.floor(new Date(bars[i].date).getTime() / 1000),
      value: parseFloat(avg.toFixed(4)),
    });
  }
  return result;
}

export function calcRSI(bars: PriceBar[], period = 14): LinePoint[] {
  if (bars.length < period + 1) return [];
  const closes = bars.map(b => b.close);
  const gains: number[] = [];
  const losses: number[] = [];

  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const result: LinePoint[] = [];

  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      avgGain = (avgGain * (period - 1) + gains[i - 1]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i - 1]) / period;
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - 100 / (1 + rs);
    result.push({
      time: Math.floor(new Date(bars[i].date).getTime() / 1000),
      value: parseFloat(rsi.toFixed(2)),
    });
  }
  return result;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(...new Array(period - 1).fill(NaN));
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

export interface MACDPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

export function calcMACD(
  bars: PriceBar[],
  fast = 12,
  slow = 26,
  signal = 9,
): MACDPoint[] {
  const closes = bars.map(b => b.close);
  const fastEMA = ema(closes, fast);
  const slowEMA = ema(closes, slow);
  const macdLine = fastEMA.map((v, i) =>
    isNaN(v) || isNaN(slowEMA[i]) ? NaN : v - slowEMA[i],
  );

  const validMacd = macdLine.filter(v => !isNaN(v));
  const signalLine = ema(validMacd, signal);

  const result: MACDPoint[] = [];
  let signalIdx = 0;
  let macdValidStart = macdLine.findIndex(v => !isNaN(v));

  for (let i = macdValidStart; i < bars.length; i++) {
    const m = macdLine[i];
    if (isNaN(m)) continue;
    const sigOffset = signalIdx - (signal - 1);
    if (sigOffset >= 0 && !isNaN(signalLine[signalIdx])) {
      const s = signalLine[signalIdx];
      result.push({
        time: Math.floor(new Date(bars[i].date).getTime() / 1000),
        macd: parseFloat(m.toFixed(4)),
        signal: parseFloat(s.toFixed(4)),
        histogram: parseFloat((m - s).toFixed(4)),
      });
    }
    signalIdx++;
  }
  return result;
}
