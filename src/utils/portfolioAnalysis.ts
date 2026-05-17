// Pure analysis functions for the Portfolio Analysis card.
// No React, no I/O. Inputs: positions, quotes, profiles, cash. Outputs: allocation
// slices and concentration metrics.

import type { PortfolioPosition } from './portfolioStorage';
import type { AssetProfile } from '../api/types';

export type AllocationDimension = 'sector' | 'assetClass' | 'geography';

export interface AllocationSlice {
  label: string;
  value: number;   // dollar value
  pct: number;     // 0–1 fraction of total
}

// ── Classifiers ──────────────────────────────────────────────────────────

export type AssetClass = 'Stock' | 'ETF / Fund' | 'Crypto' | 'Cash' | 'Other';

export function classifyAssetClass(symbol: string, profile: AssetProfile | undefined): AssetClass {
  if (/-USD$/i.test(symbol)) return 'Crypto';
  // Fund profile fields are only populated for ETFs/mutual funds.
  if (profile?.fundFamily || profile?.legalType || profile?.fundCategory) return 'ETF / Fund';
  if (profile?.sector || profile?.industry) return 'Stock';
  return 'Other';
}

export type GeographyBucket =
  | 'US'
  | 'International Developed'
  | 'Emerging Markets'
  | 'Global / Mixed'
  | 'Digital'
  | 'Cash'
  | 'Unknown';

// Coarse country → region map. Anything not listed falls into Unknown for stocks.
const DEVELOPED_COUNTRIES = new Set([
  'United Kingdom', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Switzerland',
  'Sweden', 'Norway', 'Denmark', 'Finland', 'Belgium', 'Austria', 'Ireland', 'Portugal',
  'Japan', 'South Korea', 'Singapore', 'Hong Kong', 'Taiwan', 'Israel',
  'Canada', 'Australia', 'New Zealand',
]);

const EMERGING_COUNTRIES = new Set([
  'China', 'India', 'Brazil', 'Mexico', 'South Africa', 'Russia', 'Turkey',
  'Thailand', 'Indonesia', 'Malaysia', 'Philippines', 'Vietnam',
  'Argentina', 'Chile', 'Colombia', 'Peru', 'Egypt', 'Saudi Arabia', 'United Arab Emirates',
  'Poland', 'Hungary', 'Czech Republic', 'Greece',
]);

export function classifyGeography(
  symbol: string,
  assetClass: AssetClass,
  profile: AssetProfile | undefined,
): GeographyBucket {
  if (assetClass === 'Cash')   return 'Cash';
  if (assetClass === 'Crypto') return 'Digital';

  if (assetClass === 'ETF / Fund') {
    // Best-effort keyword match on fund category. ETFs report issuer country,
    // not underlying geography, so country is unreliable here.
    const cat = (profile?.fundCategory || '').toLowerCase();
    if (!cat) return 'Global / Mixed';
    if (/emerg/.test(cat)) return 'Emerging Markets';
    if (/foreign|international|developed.*ex.*u\.?s\.?|world.*ex.*u\.?s\.?/.test(cat)) return 'International Developed';
    if (/global|world/.test(cat)) return 'Global / Mixed';
    // Most other categories (Large Growth, Mid-Cap Value, Real Estate, etc.) are US by default.
    return 'US';
  }

  // Stocks: trust profile.country.
  const country = profile?.country;
  if (!country) return 'Unknown';
  if (country === 'United States' || country === 'USA' || country === 'US') return 'US';
  if (DEVELOPED_COUNTRIES.has(country)) return 'International Developed';
  if (EMERGING_COUNTRIES.has(country)) return 'Emerging Markets';
  return 'Unknown';
}

// ── Allocation ───────────────────────────────────────────────────────────

interface PositionView {
  symbol: string;
  marketValue: number;
  profile: AssetProfile | undefined;
}

function gatherPositionViews(
  positions: PortfolioPosition[],
  priceBySymbol: Record<string, number | undefined>,
  profileBySymbol: Record<string, AssetProfile | undefined>,
): PositionView[] {
  const out: PositionView[] = [];
  for (const p of positions) {
    const price = priceBySymbol[p.symbol];
    if (price === undefined || !isFinite(price)) continue;
    out.push({
      symbol: p.symbol,
      marketValue: p.shares * price,
      profile: profileBySymbol[p.symbol],
    });
  }
  return out;
}

export function computeAllocation(
  positions: PortfolioPosition[],
  priceBySymbol: Record<string, number | undefined>,
  profileBySymbol: Record<string, AssetProfile | undefined>,
  cash: number,
  dimension: AllocationDimension,
): AllocationSlice[] {
  const views = gatherPositionViews(positions, priceBySymbol, profileBySymbol);
  const buckets: Record<string, number> = {};

  for (const v of views) {
    let label: string;
    if (dimension === 'sector') {
      label = v.profile?.sector || 'Unknown';
    } else if (dimension === 'assetClass') {
      label = classifyAssetClass(v.symbol, v.profile);
    } else {
      const ac = classifyAssetClass(v.symbol, v.profile);
      label = classifyGeography(v.symbol, ac, v.profile);
    }
    buckets[label] = (buckets[label] || 0) + v.marketValue;
  }

  // Cash slice: included in assetClass and geography, excluded from sector.
  if (cash > 0 && dimension !== 'sector') {
    buckets['Cash'] = (buckets['Cash'] || 0) + cash;
  }

  const total = Object.values(buckets).reduce((s, n) => s + n, 0);
  if (total <= 0) return [];

  return Object.entries(buckets)
    .map(([label, value]) => ({ label, value, pct: value / total }))
    .sort((a, b) => b.value - a.value);
}

// ── Concentration ────────────────────────────────────────────────────────

export type HhiBand = 'Diversified' | 'Moderate' | 'Concentrated';

export interface ConcentrationMetrics {
  count: number;          // number of priced positions (cash excluded)
  largestPct: number;     // 0–1, largest single position as fraction of holdings
  top3Pct: number;        // 0–1, top 3 positions combined
  hhi: number;            // 0–1, Herfindahl–Hirschman Index of holdings only
  hhiBand: HhiBand;
}

export function bandForHhi(hhi: number): HhiBand {
  if (hhi < 0.15) return 'Diversified';
  if (hhi < 0.25) return 'Moderate';
  return 'Concentrated';
}

export function computeConcentration(
  positions: PortfolioPosition[],
  priceBySymbol: Record<string, number | undefined>,
): ConcentrationMetrics {
  const values: number[] = [];
  for (const p of positions) {
    const price = priceBySymbol[p.symbol];
    if (price === undefined || !isFinite(price)) continue;
    const v = p.shares * price;
    if (v > 0) values.push(v);
  }

  if (values.length === 0) {
    return { count: 0, largestPct: 0, top3Pct: 0, hhi: 0, hhiBand: 'Diversified' };
  }

  values.sort((a, b) => b - a);
  const total = values.reduce((s, n) => s + n, 0);
  const largestPct = values[0] / total;
  const top3Pct = values.slice(0, 3).reduce((s, n) => s + n, 0) / total;
  const hhi = values.reduce((s, v) => s + (v / total) ** 2, 0);

  return {
    count: values.length,
    largestPct,
    top3Pct,
    hhi,
    hhiBand: bandForHhi(hhi),
  };
}

// ── Color palette ────────────────────────────────────────────────────────

// Stable color assignment by label so slices don't reshuffle hues between renders.
// Falls back to a deterministic hash for unknown labels.
const PALETTE = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f97316', // orange
  '#8b5cf6', // purple
  '#06b6d4', // cyan
  '#f59e0b', // yellow
  '#ef4444', // red
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // violet
  '#84cc16', // lime
  '#64748b', // slate (fallback / Unknown)
];

const FIXED_COLORS: Record<string, string> = {
  'Cash':                    '#64748b',
  'Unknown':                 '#475569',
  'Global / Mixed':          '#94a3b8',
  'Digital':                 '#f59e0b',
  'US':                      '#3b82f6',
  'International Developed': '#22c55e',
  'Emerging Markets':        '#f97316',
  'Stock':                   '#3b82f6',
  'ETF / Fund':              '#22c55e',
  'Crypto':                  '#f59e0b',
  'Other':                   '#64748b',
};

export function colorForLabel(label: string, indexFallback: number): string {
  if (FIXED_COLORS[label]) return FIXED_COLORS[label];
  return PALETTE[indexFallback % PALETTE.length];
}
