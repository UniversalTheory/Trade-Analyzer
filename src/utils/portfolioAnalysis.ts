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

export function classifyAssetClass(
  symbol: string,
  profile: AssetProfile | undefined,
  positionType?: PortfolioPosition['type'],
): AssetClass {
  if (/-USD$/i.test(symbol)) return 'Crypto';
  // A fund position is authoritative — don't depend on the profile fetch landing.
  if (positionType === 'fund') return 'ETF / Fund';
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
  type: PortfolioPosition['type'];
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
      type: p.type,
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
      // Funds don't get a single sector — bucket them as ETF / Fund even when a
      // (company-style) sector somehow leaks through on the profile.
      if (v.type !== 'fund' && v.profile?.sector) {
        label = v.profile.sector;
      } else {
        // Stocks usually have a sector; ETFs and crypto don't. Bucket them
        // by asset class so they don't all merge into "Unknown".
        const ac = classifyAssetClass(v.symbol, v.profile, v.type);
        label = ac === 'ETF / Fund' || ac === 'Crypto' ? ac : 'Unknown';
      }
    } else if (dimension === 'assetClass') {
      label = classifyAssetClass(v.symbol, v.profile, v.type);
    } else {
      const ac = classifyAssetClass(v.symbol, v.profile, v.type);
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
  largestSymbol: string;  // symbol of the largest holding (empty when count===0)
  top3Pct: number;        // 0–1, top 3 positions combined
  top3Symbols: string[];  // up to 3 symbols ordered largest → smallest
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
  const entries: { symbol: string; value: number }[] = [];
  for (const p of positions) {
    const price = priceBySymbol[p.symbol];
    if (price === undefined || !isFinite(price)) continue;
    const v = p.shares * price;
    if (v > 0) entries.push({ symbol: p.symbol, value: v });
  }

  if (entries.length === 0) {
    return {
      count: 0,
      largestPct: 0,
      largestSymbol: '',
      top3Pct: 0,
      top3Symbols: [],
      hhi: 0,
      hhiBand: 'Diversified',
    };
  }

  entries.sort((a, b) => b.value - a.value);
  const total = entries.reduce((s, e) => s + e.value, 0);
  const top3 = entries.slice(0, 3);
  const largestPct = entries[0].value / total;
  const top3Pct = top3.reduce((s, e) => s + e.value, 0) / total;
  const hhi = entries.reduce((s, e) => s + (e.value / total) ** 2, 0);

  return {
    count: entries.length,
    largestPct,
    largestSymbol: entries[0].symbol,
    top3Pct,
    top3Symbols: top3.map(e => e.symbol),
    hhi,
    hhiBand: bandForHhi(hhi),
  };
}

// ── Color palette ────────────────────────────────────────────────────────

// Labels with reserved colors. These hues are intentionally NOT in the general
// palette below, so a fixed-color label can never collide with a palette-assigned
// label in the same chart.
const FIXED_COLORS: Record<string, string> = {
  // Neutrals — used across dimensions for "no info" / cash-like buckets.
  'Cash':                    '#64748b', // slate
  'Unknown':                 '#475569', // dark slate
  'Global / Mixed':          '#94a3b8', // light slate
  'Other':                   '#78716c', // stone

  // Asset class.
  'Stock':                   '#0ea5e9', // sky
  'ETF / Fund':              '#a855f7', // violet
  'Crypto':                  '#fbbf24', // amber

  // Geography — reuse the asset-class hues that they're conceptually closest to.
  'US':                      '#0ea5e9', // sky (same as Stock — never in same chart)
  'International Developed': '#a855f7', // violet (same as ETF/Fund — never in same chart)
  'Emerging Markets':        '#ec4899', // pink
  'Digital':                 '#fbbf24', // amber (same as Crypto — same concept)
};

// General palette for labels without a fixed color (i.e. sector names).
// Deliberately disjoint from FIXED_COLORS hues to prevent collisions.
const GENERAL_PALETTE = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f97316', // orange
  '#06b6d4', // cyan
  '#ef4444', // red
  '#14b8a6', // teal
  '#84cc16', // lime
  '#eab308', // yellow
  '#8b5cf6', // purple
  '#f472b6', // light pink
  '#65a30d', // dark lime
  '#e11d48', // rose
];

// Overflow: golden-angle HSL spread guarantees distinct hues for any extra labels.
function overflowColor(idx: number): string {
  const hue = (idx * 137.508) % 360;
  return `hsl(${hue.toFixed(0)}, 65%, 55%)`;
}

/**
 * Assign colors to a list of labels, guaranteeing no two distinct labels share
 * a color within the same chart. Fixed-color labels get their reserved hue;
 * remaining labels draw from the general palette, skipping any hue already
 * claimed by a fixed-color label in the same set.
 */
export function assignColors(labels: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const used = new Set<string>();

  for (const label of labels) {
    const fixed = FIXED_COLORS[label];
    if (fixed && !out[label]) {
      out[label] = fixed;
      used.add(fixed);
    }
  }

  let palIdx = 0;
  let overflowIdx = 0;
  for (const label of labels) {
    if (out[label]) continue;
    while (palIdx < GENERAL_PALETTE.length && used.has(GENERAL_PALETTE[palIdx])) {
      palIdx++;
    }
    if (palIdx < GENERAL_PALETTE.length) {
      out[label] = GENERAL_PALETTE[palIdx];
      used.add(GENERAL_PALETTE[palIdx]);
      palIdx++;
    } else {
      out[label] = overflowColor(overflowIdx++);
    }
  }
  return out;
}
