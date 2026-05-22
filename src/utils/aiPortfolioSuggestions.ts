import { useEffect, useRef, useState } from 'react';
import { ai } from '../api/client';
import { setSnapshot as setUsageSnapshot } from './aiUsageStore';
import type { PortfolioPosition } from './portfolioStorage';
import type { AssetProfile } from '../api/types';
import {
  computeAllocation,
  computeConcentration,
} from './portfolioAnalysis';
import type { Suggestion } from './portfolioSuggestions';

const MAX_TOKENS = 600;

export interface AiSuggestionsInputs {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
  profileBySymbol: Record<string, AssetProfile | undefined>;
  cash: number;
  // Existing rule-based titles so the AI doesn't restate them.
  ruleBasedTitles: string[];
}

export type AiSuggestionsState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; suggestions: Suggestion[]; costUsd: number; fromCache: boolean }
  | { kind: 'skipped' };

const SYSTEM = [
  'You are a portfolio analyst surfacing non-obvious risks and opportunities.',
  'Given a portfolio snapshot, flag 1-3 observations the deterministic rule engine would miss — e.g., theme/factor concentration that crosses sector lines (AI infrastructure, mega-cap tech, rate-sensitive), correlated holdings (multiple semis, multiple banks), valuation skew, regime fragility, or subtle missing exposures (no quality value, no real assets).',
  'Avoid restating any of the rule-based findings already listed.',
  'Output ONLY valid JSON. No prose before or after. No code fences. Start with [ and end with ].',
  'Schema: [{"title": "<=60 chars", "rationale": "1-2 sentences", "severity": "info"|"notice"|"warning", "tickers": ["XYZ"]}]',
  'If nothing interesting to flag, return [].',
].join(' ');

interface RawSuggestion {
  title: unknown;
  rationale: unknown;
  severity?: unknown;
  tickers?: unknown;
}

function parseSuggestions(text: string): Suggestion[] {
  // Strip optional code fences and leading prose.
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const open = s.indexOf('[');
  const close = s.lastIndexOf(']');
  if (open < 0 || close < 0 || close <= open) return [];
  s = s.slice(open, close + 1);

  let parsed: unknown;
  try { parsed = JSON.parse(s); } catch { return []; }
  if (!Array.isArray(parsed)) return [];

  const out: Suggestion[] = [];
  for (let i = 0; i < parsed.length && out.length < 5; i++) {
    const r = parsed[i] as RawSuggestion;
    if (!r || typeof r.title !== 'string' || typeof r.rationale !== 'string') continue;
    const sev = r.severity === 'warning' || r.severity === 'notice' ? r.severity : 'info';
    const tickers = Array.isArray(r.tickers) ? r.tickers.filter((t): t is string => typeof t === 'string' && t.length > 0 && t.length < 8) : [];
    out.push({
      id: `ai-${i}-${r.title.slice(0, 20).replace(/\s+/g, '-')}`,
      category: 'ai',
      severity: sev,
      title: r.title.slice(0, 80),
      rationale: r.rationale.slice(0, 400),
      candidates: tickers.slice(0, 4).map(t => ({ symbol: t.toUpperCase() })),
      source: 'ai',
    });
  }
  return out;
}

function buildPrompt(inputs: AiSuggestionsInputs): string {
  const { positions, priceBySymbol, profileBySymbol, cash } = inputs;
  const lines: string[] = [];

  // Holdings with weight + sector
  const valued: { symbol: string; value: number; pct: number; sector?: string }[] = [];
  let total = 0;
  for (const p of positions) {
    const px = priceBySymbol[p.symbol];
    if (typeof px === 'number' && isFinite(px) && px > 0) {
      const v = p.shares * px;
      valued.push({ symbol: p.symbol, value: v, pct: 0, sector: profileBySymbol[p.symbol]?.sector });
      total += v;
    }
  }
  for (const v of valued) v.pct = total > 0 ? v.value / total : 0;
  valued.sort((a, b) => b.pct - a.pct);

  lines.push(`Portfolio: ${valued.length} positions, $${Math.round(total).toLocaleString()} holdings + $${Math.round(cash).toLocaleString()} cash`);
  lines.push('');
  lines.push('Holdings (sorted by weight):');
  for (const v of valued) {
    const sec = v.sector ? ` · ${v.sector}` : '';
    lines.push(`  ${v.symbol}: ${(v.pct * 100).toFixed(1)}%${sec}`);
  }

  // Allocations
  const sectorSlices = computeAllocation(positions, priceBySymbol, profileBySymbol, cash, 'sector');
  const assetSlices = computeAllocation(positions, priceBySymbol, profileBySymbol, cash, 'assetClass');
  const geoSlices = computeAllocation(positions, priceBySymbol, profileBySymbol, cash, 'geography');

  if (sectorSlices.length > 0) {
    lines.push('');
    lines.push('Sector mix: ' + sectorSlices.filter(s => s.pct >= 0.02).map(s => `${s.label} ${(s.pct * 100).toFixed(0)}%`).join(', '));
  }
  if (assetSlices.length > 0) {
    lines.push('Asset class: ' + assetSlices.filter(s => s.pct >= 0.02).map(s => `${s.label} ${(s.pct * 100).toFixed(0)}%`).join(', '));
  }
  if (geoSlices.length > 0) {
    lines.push('Geography: ' + geoSlices.filter(s => s.pct >= 0.02).map(s => `${s.label} ${(s.pct * 100).toFixed(0)}%`).join(', '));
  }

  // Concentration
  const conc = computeConcentration(positions, priceBySymbol);
  if (conc.count > 0) {
    lines.push('');
    lines.push(`Concentration: ${conc.count} positions, largest ${(conc.largestPct * 100).toFixed(0)}% (${conc.largestSymbol ?? '?'}), top-3 ${(conc.top3Pct * 100).toFixed(0)}%, HHI ${conc.hhi.toFixed(3)} (${conc.hhiBand})`);
  }

  if (inputs.ruleBasedTitles.length > 0) {
    lines.push('');
    lines.push('Rule-based findings already shown to user (do not repeat):');
    for (const t of inputs.ruleBasedTitles) lines.push(`  - ${t}`);
  }

  return lines.join('\n');
}

export function useAiPortfolioSuggestions(inputs: AiSuggestionsInputs): AiSuggestionsState {
  const [state, setState] = useState<AiSuggestionsState>({ kind: 'idle' });
  const reqId = useRef(0);

  // Fingerprint so identical re-renders don't refire.
  const fingerprint = [
    inputs.positions.length,
    inputs.cash.toFixed(0),
    inputs.positions.map(p => `${p.symbol}:${p.shares}`).join(','),
    Object.entries(inputs.priceBySymbol).filter(([, v]) => v != null).map(([k, v]) => `${k}=${v?.toFixed(2)}`).join(','),
    inputs.ruleBasedTitles.join('|'),
  ].join('||');

  useEffect(() => {
    // Empty portfolio → don't burn a call.
    if (inputs.positions.length === 0) {
      setState({ kind: 'skipped' });
      return;
    }
    // Need at least some priced positions.
    const priced = inputs.positions.filter(p => {
      const px = inputs.priceBySymbol[p.symbol];
      return typeof px === 'number' && isFinite(px) && px > 0;
    });
    if (priced.length === 0) {
      setState({ kind: 'skipped' });
      return;
    }

    const my = ++reqId.current;
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const status = await ai.getStatus().catch(() => ({ configured: false }));
        if (!status.configured) {
          if (!cancelled && reqId.current === my) setState({ kind: 'skipped' });
          return;
        }

        const resp = await ai.analyze({
          task: 'portfolioSuggestions',
          system: SYSTEM,
          userContent: buildPrompt(inputs),
          maxTokens: MAX_TOKENS,
          cacheKey: `portfolioSuggestions:${fingerprint}`,
        });

        if (cancelled || reqId.current !== my) return;
        setUsageSnapshot(resp.usage);
        const suggestions = parseSuggestions(resp.text);
        setState({
          kind: 'ready',
          suggestions,
          costUsd: resp.costUsd,
          fromCache: resp.fromCache,
        });
      } catch {
        if (cancelled || reqId.current !== my) return;
        setState({ kind: 'skipped' });
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  return state;
}
