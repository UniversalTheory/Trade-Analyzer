// Pure calculation functions for portfolio totals. No React, no I/O.

import type { PortfolioPosition } from './portfolioStorage';
import type { PriceBar } from '../api/types';

export interface PositionMetrics {
  costBasis: number;
  marketValue: number;
  pl: number;
  plPct: number; // 0.0823 = +8.23%
}

export function computePositionMetrics(
  position: PortfolioPosition,
  currentPrice: number | undefined,
): PositionMetrics | null {
  if (currentPrice === undefined || !isFinite(currentPrice)) return null;
  const costBasis = position.shares * position.avgPrice;
  const marketValue = position.shares * currentPrice;
  const pl = marketValue - costBasis;
  const plPct = costBasis > 0 ? pl / costBasis : 0;
  return { costBasis, marketValue, pl, plPct };
}

export interface PortfolioTotals {
  holdingsTotal: number;     // sum of position market values
  totalCostBasis: number;
  totalPL: number;
  totalPLPct: number;
  totalPortfolio: number;    // holdingsTotal + cash
  pricedCount: number;       // how many positions had a usable quote
}

export function computePortfolioTotals(
  positions: PortfolioPosition[],
  priceBySymbol: Record<string, number | undefined>,
  cash: number,
): PortfolioTotals {
  let holdingsTotal = 0;
  let totalCostBasis = 0;
  let pricedCount = 0;

  for (const p of positions) {
    const metrics = computePositionMetrics(p, priceBySymbol[p.symbol]);
    if (!metrics) continue;
    holdingsTotal += metrics.marketValue;
    totalCostBasis += metrics.costBasis;
    pricedCount += 1;
  }

  const totalPL = holdingsTotal - totalCostBasis;
  const totalPLPct = totalCostBasis > 0 ? totalPL / totalCostBasis : 0;
  const totalPortfolio = holdingsTotal + cash;

  return {
    holdingsTotal,
    totalCostBasis,
    totalPL,
    totalPLPct,
    totalPortfolio,
    pricedCount,
  };
}

// ── Period (date-based) P/L ──────────────────────────────────────────────

export interface PositionPeriodMetrics {
  baseline: number;     // value of the holding at the period start
  pl: number;           // current value − baseline
  plPct: number;
  isLateAdd: boolean;   // position was added AFTER the selected date
}

/** Find the close on or before `isoDate` ('YYYY-MM-DD') in a chronological bar list. */
export function findCloseOnOrBefore(history: PriceBar[] | undefined, isoDate: string): number | null {
  if (!history || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].date.slice(0, 10) <= isoDate) return history[i].close;
  }
  return null;
}

export function computePositionPeriodMetrics(
  position: PortfolioPosition,
  currentPrice: number | undefined,
  history: PriceBar[] | undefined,
  selectedDate: string,
): PositionPeriodMetrics | null {
  if (currentPrice === undefined || !isFinite(currentPrice)) return null;

  let baselinePrice: number;
  let isLateAdd = false;

  if (position.addedAt > selectedDate) {
    // Position didn't exist on the selected date — use cost basis as baseline.
    baselinePrice = position.avgPrice;
    isLateAdd = true;
  } else {
    const close = findCloseOnOrBefore(history, selectedDate);
    if (close === null) return null;
    baselinePrice = close;
  }

  const baseline = position.shares * baselinePrice;
  const current  = position.shares * currentPrice;
  const pl = current - baseline;
  const plPct = baseline > 0 ? pl / baseline : 0;

  return { baseline, pl, plPct, isLateAdd };
}

export interface PortfolioPeriodTotals {
  baseline: number;
  pl: number;
  plPct: number;
  pricedCount: number;
  excludedCount: number;  // positions we couldn't price for the period
  lateAddCount: number;
}

export function computePortfolioPeriodTotals(
  positions: PortfolioPosition[],
  priceBySymbol: Record<string, number | undefined>,
  historyBySymbol: Record<string, PriceBar[] | undefined>,
  selectedDate: string,
): PortfolioPeriodTotals {
  let baseline = 0;
  let pl = 0;
  let pricedCount = 0;
  let excludedCount = 0;
  let lateAddCount = 0;

  for (const p of positions) {
    const m = computePositionPeriodMetrics(
      p,
      priceBySymbol[p.symbol],
      historyBySymbol[p.symbol],
      selectedDate,
    );
    if (!m) { excludedCount += 1; continue; }
    baseline += m.baseline;
    pl += m.pl;
    pricedCount += 1;
    if (m.isLateAdd) lateAddCount += 1;
  }

  const plPct = baseline > 0 ? pl / baseline : 0;
  return { baseline, pl, plPct, pricedCount, excludedCount, lateAddCount };
}

// ── Formatting ───────────────────────────────────────────────────────────

export function fmtUSD(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPct(frac: number): string {
  return `${(frac * 100).toFixed(2)}%`;
}

export function signed(n: number): string {
  return n >= 0 ? '+' : '';
}
