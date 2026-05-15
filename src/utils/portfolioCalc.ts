// Pure calculation functions for portfolio totals. No React, no I/O.

import type { PortfolioPosition } from './portfolioStorage';

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
