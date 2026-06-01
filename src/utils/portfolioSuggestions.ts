// Rule-based suggestion engine for the Portfolio Analysis card.
// Pure compute. Each rule returns zero or one Suggestion. The engine runs all
// rules and orders the output by severity. Phase 6 (AI insights) plugs in by
// adding suggestions with source='ai' to the same array — no UI changes needed.

import type { PortfolioPosition } from './portfolioStorage';
import type { AssetProfile, FundData } from '../api/types';
import {
  computeAllocation,
  computeConcentration,
  classifyAssetClass,
  type AssetClass,
} from './portfolioAnalysis';

export type SuggestionSeverity = 'info' | 'notice' | 'warning';
export type SuggestionCategory  = 'sector' | 'concentration' | 'geography' | 'asset_class' | 'ai';
export type SuggestionSource    = 'rule' | 'ai';

export interface SuggestionCandidate {
  symbol: string;
  hint?: string;   // optional short qualifier, e.g. "broad", "defensive"
}

export interface Suggestion {
  id: string;
  category: SuggestionCategory;
  severity: SuggestionSeverity;
  title: string;
  rationale: string;
  candidates: SuggestionCandidate[];
  source: SuggestionSource;
}

export interface SuggestionInputs {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
  profileBySymbol: Record<string, AssetProfile | undefined>;
  cash: number;
  // Optional per-fund sector data. When present, ETFs/funds are "looked
  // through" to their underlying sectors (same see-through used by the
  // Allocation donut), so sector rules reason about real exposure instead of
  // an opaque ETF/Fund bucket. The >40% opaque-share guard below then reads
  // the post-see-through residual (bond sleeves / unresolved funds) — equity
  // funds dissolve into sectors and stop triggering suppression.
  fundDataBySymbol?: Record<string, FundData | undefined>;
}

// ── Reference data ───────────────────────────────────────────────────────

const SECTOR_ETFS: Record<string, SuggestionCandidate[]> = {
  'Technology':             [{ symbol: 'XLK' }, { symbol: 'VGT' }, { symbol: 'QQQ', hint: 'Nasdaq-100' }],
  'Healthcare':             [{ symbol: 'XLV' }, { symbol: 'VHT' }],
  'Financial Services':     [{ symbol: 'XLF' }, { symbol: 'VFH' }],
  'Consumer Cyclical':      [{ symbol: 'XLY' }, { symbol: 'VCR' }],
  'Consumer Defensive':     [{ symbol: 'XLP', hint: 'defensive' }, { symbol: 'VDC' }],
  'Energy':                 [{ symbol: 'XLE' }, { symbol: 'VDE' }],
  'Utilities':              [{ symbol: 'XLU', hint: 'defensive' }, { symbol: 'VPU' }],
  'Industrials':            [{ symbol: 'XLI' }, { symbol: 'VIS' }],
  'Basic Materials':        [{ symbol: 'XLB' }, { symbol: 'VAW' }],
  'Real Estate':            [{ symbol: 'XLRE' }, { symbol: 'VNQ' }],
  'Communication Services': [{ symbol: 'XLC' }, { symbol: 'VOX' }],
};

// Sectors we'll explicitly call out as "missing" if a portfolio has ~0% in them.
// Intentionally narrow: only the broad pillars an equity investor usually wants
// some exposure to. Skipping Materials/Real Estate/Comm Services to avoid noise.
const CORE_SECTORS = [
  'Technology',
  'Healthcare',
  'Financial Services',
  'Consumer Cyclical',
  'Consumer Defensive',
  'Industrials',
];

const INTERNATIONAL_ETFS: SuggestionCandidate[] = [
  { symbol: 'VXUS', hint: 'total ex-US' },
  { symbol: 'IEFA', hint: 'developed' },
  { symbol: 'EEM',  hint: 'emerging' },
];

const BOND_ETFS: SuggestionCandidate[] = [
  { symbol: 'BND',  hint: 'total bond' },
  { symbol: 'AGG',  hint: 'aggregate' },
  { symbol: 'TLT',  hint: 'long Treasuries' },
  { symbol: 'IEF',  hint: 'intermediate' },
];

const COMMODITY_ETFS: SuggestionCandidate[] = [
  { symbol: 'GLD', hint: 'gold' },
  { symbol: 'SLV', hint: 'silver' },
];

// Heuristic: ticker symbols that we'll *recognize* as bonds or commodities
// when looking at the user's existing holdings. Avoids needing a holdings
// classification API. Expand later or move to a backend lookup.
const KNOWN_BOND_SYMBOLS     = new Set(['BND', 'AGG', 'TLT', 'IEF', 'SHY', 'BNDX', 'GOVT', 'LQD', 'HYG', 'TIP', 'VTIP', 'VGSH', 'VGIT', 'VGLT', 'MUB', 'EMB', 'JNK']);
const KNOWN_COMMODITY_SYMBOLS = new Set(['GLD', 'SLV', 'IAU', 'DBC', 'GLDM', 'PALL', 'PPLT', 'USO', 'UNG', 'DBA']);

// Thresholds — chosen by feel, not tuned.
const SECTOR_OVERWEIGHT_PCT      = 0.40; // a single sector >40% of equity exposure
const SECTOR_GAP_PCT             = 0.02; // <2% in a core sector counts as "missing"
const SINGLE_POSITION_NOTICE     = 0.25; // single holding >25% of total
const SINGLE_POSITION_WARNING    = 0.40; // single holding >40% of total
const ETF_FUND_OPAQUE_PCT        = 0.40; // if ETF/Fund slice exceeds this on Sector view,
                                          // the underlying mix is too opaque to trust sector rules.
const US_DOMINANT_PCT            = 0.90; // US >90% triggers geography gap

// ── Engine ───────────────────────────────────────────────────────────────

export function computeSuggestions(inputs: SuggestionInputs): Suggestion[] {
  const { positions, priceBySymbol, profileBySymbol, cash, fundDataBySymbol } = inputs;
  const out: Suggestion[] = [];

  // Pre-compute the breakdowns once. Fund see-through only affects the sector
  // dimension (Yahoo gives no reliable fund geography, and a fund stays in the
  // ETF/Fund asset class regardless) — passing it to all three keeps the calls
  // consistent and future-proof.
  const sectorSlices    = computeAllocation(positions, priceBySymbol, profileBySymbol, cash, 'sector', fundDataBySymbol);
  const assetClass      = computeAllocation(positions, priceBySymbol, profileBySymbol, cash, 'assetClass', fundDataBySymbol);
  const geography       = computeAllocation(positions, priceBySymbol, profileBySymbol, cash, 'geography', fundDataBySymbol);
  const concentration   = computeConcentration(positions, priceBySymbol);

  if (concentration.count === 0) return out; // nothing priced yet

  // ── Sector rules ───────────────────────────────────────────────────────
  // Skip sector rules entirely if too much of the portfolio is in an opaque
  // ETF/Fund bucket — we can't reliably claim a sector is "missing" when
  // half the portfolio's sector composition is unknown.
  const etfFundSlice = sectorSlices.find(s => s.label === 'ETF / Fund');
  const sectorOpaqueShare = etfFundSlice?.pct ?? 0;

  if (sectorOpaqueShare < ETF_FUND_OPAQUE_PCT) {
    // Overweight sectors.
    for (const s of sectorSlices) {
      if (s.label === 'ETF / Fund' || s.label === 'Crypto' || s.label === 'Unknown') continue;
      if (s.pct >= SECTOR_OVERWEIGHT_PCT) {
        const others = Object.keys(SECTOR_ETFS).filter(k => k !== s.label);
        // Surface 4 diversifier ETFs across other sectors (one each from defensive
        // and rotational sectors when possible).
        const candidates: SuggestionCandidate[] = [];
        for (const sect of others) {
          const cand = SECTOR_ETFS[sect]?.[0];
          if (cand) candidates.push({ ...cand, hint: sect.toLowerCase() });
          if (candidates.length >= 4) break;
        }
        out.push({
          id: `sector-overweight-${s.label}`,
          category: 'sector',
          severity: 'warning',
          title: `${s.label} overweight`,
          rationale: `${s.label} is ${(s.pct * 100).toFixed(0)}% of your equity holdings. A single-sector concentration of this size means your performance will track that sector closely. Consider trimming or adding exposure to other sectors.`,
          candidates,
          source: 'rule',
        });
      }
    }

    // Missing core sectors.
    const presentSectors = new Set(sectorSlices.filter(s => s.pct >= SECTOR_GAP_PCT).map(s => s.label));
    const missing = CORE_SECTORS.filter(s => !presentSectors.has(s));
    if (missing.length >= 2) {
      // Group multiple missing core sectors into a single suggestion to avoid spamming.
      const candidates: SuggestionCandidate[] = [];
      for (const sect of missing.slice(0, 3)) {
        const cand = SECTOR_ETFS[sect]?.[0];
        if (cand) candidates.push({ ...cand, hint: sect.toLowerCase() });
      }
      out.push({
        id: 'sector-gaps',
        category: 'sector',
        severity: 'info',
        title: `Missing core sectors`,
        rationale: `You have little or no exposure to: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? `, +${missing.length - 3} more` : ''}. Broad sector ETFs can fill the gap without adding single-stock risk.`,
        candidates,
        source: 'rule',
      });
    } else if (missing.length === 1) {
      const sect = missing[0];
      const candidates = SECTOR_ETFS[sect]?.slice(0, 3) ?? [];
      out.push({
        id: `sector-gap-${sect}`,
        category: 'sector',
        severity: 'info',
        title: `No ${sect} exposure`,
        rationale: `You have essentially no position in ${sect}. Adding a sector ETF can round out your equity exposure.`,
        candidates,
        source: 'rule',
      });
    }
  }

  // ── Concentration rules ────────────────────────────────────────────────
  // Compute position weights once.
  const valued: { symbol: string; value: number }[] = [];
  let totalHoldings = 0;
  for (const p of positions) {
    const px = priceBySymbol[p.symbol];
    if (typeof px === 'number' && isFinite(px) && px > 0) {
      const v = p.shares * px;
      valued.push({ symbol: p.symbol, value: v });
      totalHoldings += v;
    }
  }
  if (totalHoldings > 0) {
    for (const v of valued) {
      const pct = v.value / totalHoldings;
      if (pct >= SINGLE_POSITION_WARNING) {
        out.push({
          id: `position-concentration-${v.symbol}`,
          category: 'concentration',
          severity: 'warning',
          title: `${v.symbol} is ${(pct * 100).toFixed(0)}% of holdings`,
          rationale: `A single position above 40% of your portfolio carries meaningful single-stock risk — earnings, regulatory, or sector-specific shocks would hit you disproportionately. Consider trimming or pairing with offsetting exposure.`,
          candidates: [],
          source: 'rule',
        });
      } else if (pct >= SINGLE_POSITION_NOTICE) {
        out.push({
          id: `position-concentration-${v.symbol}`,
          category: 'concentration',
          severity: 'notice',
          title: `${v.symbol} is ${(pct * 100).toFixed(0)}% of holdings`,
          rationale: `${v.symbol} is your single largest position. Above 25% concentration starts to materially expose you to single-name risk; worth keeping in mind if the thesis changes.`,
          candidates: [],
          source: 'rule',
        });
      }
    }
  }

  // ── Geography rules ────────────────────────────────────────────────────
  // Skip if the portfolio's geography is too dominated by the opaque "Global / Mixed"
  // bucket — we can't be confident there's no international exposure if half of it
  // is ETFs whose underlying geography we haven't broken out.
  const globalMixedPct = geography.find(s => s.label === 'Global / Mixed')?.pct ?? 0;
  const unknownGeoPct  = geography.find(s => s.label === 'Unknown')?.pct ?? 0;
  const opaqueGeoShare = globalMixedPct + unknownGeoPct;

  if (opaqueGeoShare < ETF_FUND_OPAQUE_PCT) {
    const usPct = geography.find(s => s.label === 'US')?.pct ?? 0;
    const intlDev = geography.find(s => s.label === 'International Developed')?.pct ?? 0;
    const intlEm  = geography.find(s => s.label === 'Emerging Markets')?.pct ?? 0;
    const intlTotal = intlDev + intlEm;

    if (usPct >= US_DOMINANT_PCT && intlTotal < 0.02) {
      out.push({
        id: 'geography-no-international',
        category: 'geography',
        severity: 'info',
        title: 'No international exposure',
        rationale: `Your portfolio is ${(usPct * 100).toFixed(0)}% US-based. International equities have historically diversified US-specific drawdowns and provide exposure to different monetary and growth regimes.`,
        candidates: INTERNATIONAL_ETFS,
        source: 'rule',
      });
    }
  }

  // ── Asset class rules ──────────────────────────────────────────────────
  // Detect missing diversifiers by scanning the user's actual tickers against
  // known bond/commodity symbol lists. This bypasses needing a holdings API
  // for fund classification.
  const heldSymbols = new Set(positions.map(p => p.symbol));
  const hasBond      = positions.some(p => KNOWN_BOND_SYMBOLS.has(p.symbol));
  const hasCommodity = positions.some(p => KNOWN_COMMODITY_SYMBOLS.has(p.symbol));

  // Total equity-ish exposure (Stock + ETF/Fund). Crypto and Cash counted separately.
  const equityClassPct = (assetClass.find(s => s.label === 'Stock')?.pct ?? 0)
                       + (assetClass.find(s => s.label === 'ETF / Fund')?.pct ?? 0);

  if (equityClassPct >= 0.85 && !hasBond) {
    // Filter candidates we already hold (avoid suggesting BND if user owns AGG).
    const filtered = BOND_ETFS.filter(c => !heldSymbols.has(c.symbol));
    if (filtered.length > 0) {
      out.push({
        id: 'asset-class-no-bonds',
        category: 'asset_class',
        severity: 'info',
        title: 'No fixed income exposure',
        rationale: `Your holdings are ${(equityClassPct * 100).toFixed(0)}% equity-like with no detected bond exposure. Bonds typically dampen drawdowns and provide an offset when equities sell off — though current rate dynamics matter for the choice of duration.`,
        candidates: filtered.slice(0, 3),
        source: 'rule',
      });
    }
  }

  if (equityClassPct >= 0.85 && !hasCommodity) {
    const filtered = COMMODITY_ETFS.filter(c => !heldSymbols.has(c.symbol));
    if (filtered.length > 0) {
      out.push({
        id: 'asset-class-no-commodity',
        category: 'asset_class',
        severity: 'info',
        title: 'No commodity exposure',
        rationale: `Gold and other commodities have historically decorrelated from equity drawdowns and acted as inflation hedges. A small allocation is a common ballast.`,
        candidates: filtered.slice(0, 2),
        source: 'rule',
      });
    }
  }

  // ── Order by severity ──────────────────────────────────────────────────
  const sevRank: Record<SuggestionSeverity, number> = { warning: 0, notice: 1, info: 2 };
  return out.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);
}

// Silence unused-import warning for AssetClass in stricter setups; the type is
// re-exported for callers that consume the engine alongside other analysis utils.
export type { AssetClass };
