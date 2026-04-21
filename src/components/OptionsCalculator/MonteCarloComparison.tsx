import { useMemo, useState } from 'react';
import ResultCard from '../common/ResultCard';
import type { DistributionAnalysis, Verdict, VerdictLevel } from '../../utils/simulationAnalysis';
import type { StrategyId } from '../../utils/strategyPayoff';
import type { StrategyBias } from '../../utils/strikeSelector';

// ── Shared types ─────────────────────────────────────────────────────────────

export interface StrategyComparisonRow {
  strategy: StrategyId;
  bias: StrategyBias;
  summary: string;              // leg summary, e.g. "Long C $250 / Short C $262"
  analysis: DistributionAnalysis; // per-contract P/L distribution
  rr: number;                   // risk/reward
  verdict: Verdict;
  maxGainPerContract: number | null;
  maxLossPerContract: number | null;
}

export interface ComparisonPayload {
  rows: StrategyComparisonRow[];
  spot: number;
  dte: number;
  paths: number;
  steps: number;
  volSource: string;
  elapsedMs: number;
}

interface Props {
  payload: ComparisonPayload;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function fmt$(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtPct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function fmtRR(rr: number): string {
  if (!Number.isFinite(rr)) return '∞';
  if (rr === 0) return '0';
  return rr.toFixed(2);
}

// ── Sort config ─────────────────────────────────────────────────────────────

type SortKey = 'strategy' | 'bias' | 'pop' | 'ev' | 'var' | 'rr' | 'verdict';
type SortDir = 'asc' | 'desc';

const VERDICT_RANK: Record<VerdictLevel, number> = {
  Strong: 4, OK: 3, Weak: 2, Avoid: 1,
};

function getSortValue(row: StrategyComparisonRow, key: SortKey): number | string {
  switch (key) {
    case 'strategy': return row.strategy;
    case 'bias':     return row.bias;
    case 'pop':      return row.analysis.pop;
    case 'ev':       return row.analysis.meanPnl;
    case 'var':      return row.analysis.var95;   // stored positive
    case 'rr':       return Number.isFinite(row.rr) ? row.rr : Number.MAX_SAFE_INTEGER;
    case 'verdict':  return VERDICT_RANK[row.verdict.level];
  }
}

// ── Bias filter chips ───────────────────────────────────────────────────────

const BIAS_CHIPS: Array<{ key: StrategyBias | 'All'; label: string }> = [
  { key: 'All',     label: 'All' },
  { key: 'Bullish', label: 'Bullish' },
  { key: 'Bearish', label: 'Bearish' },
  { key: 'Neutral', label: 'Neutral' },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function MonteCarloComparison({ payload }: Props) {
  const { rows, spot, dte, paths, steps, volSource, elapsedMs } = payload;

  const [biasFilter, setBiasFilter] = useState<StrategyBias | 'All'>('All');
  const [sortKey, setSortKey] = useState<SortKey>('pop');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const visible = useMemo(() => {
    const filtered = biasFilter === 'All'
      ? rows
      : rows.filter(r => r.bias === biasFilter);
    const sorted = [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, biasFilter, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Sensible default direction per column
      const defaultDesc: SortKey[] = ['pop', 'ev', 'rr', 'verdict'];
      setSortDir(defaultDesc.includes(key) ? 'desc' : 'asc');
    }
  }

  const sortIndicator = (key: SortKey): string => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <>
      <ResultCard title={`Strategy Comparison · ${visible.length} of ${rows.length}`}>
        <div className="mc-cmp-meta">
          <span>Spot {fmt$(spot)}</span>
          <span>{dte} DTE</span>
          <span>{paths.toLocaleString()} paths × {steps} steps</span>
          <span>{volSource}</span>
          <span>{elapsedMs.toFixed(0)} ms</span>
        </div>

        <div className="mc-cmp-filter-row">
          {BIAS_CHIPS.map(chip => (
            <button
              key={chip.key}
              type="button"
              className={`mc-bias-chip ${biasFilter === chip.key ? 'active' : ''} bias-${chip.key.toLowerCase()}`}
              onClick={() => setBiasFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="mc-cmp-table-wrap">
          <table className="mc-cmp-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => handleSort('strategy')}>
                  Strategy{sortIndicator('strategy')}
                </th>
                <th className="sortable" onClick={() => handleSort('bias')}>
                  Bias{sortIndicator('bias')}
                </th>
                <th>Legs</th>
                <th className="sortable numeric" onClick={() => handleSort('pop')}>
                  POP{sortIndicator('pop')}
                </th>
                <th className="sortable numeric" onClick={() => handleSort('ev')}>
                  EV{sortIndicator('ev')}
                </th>
                <th className="sortable numeric" onClick={() => handleSort('var')}>
                  VaR 95{sortIndicator('var')}
                </th>
                <th className="sortable numeric" onClick={() => handleSort('rr')}>
                  R:R{sortIndicator('rr')}
                </th>
                <th className="sortable" onClick={() => handleSort('verdict')}>
                  Verdict{sortIndicator('verdict')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row => {
                const { strategy, bias, summary, analysis, rr, verdict } = row;
                const evClass = analysis.meanPnl >= 0 ? 'text-green' : 'text-red';
                const popClass = analysis.pop >= 0.5 ? 'text-green' : 'text-red';
                const verdictClass =
                  verdict.level === 'Strong' ? 'verdict-strong' :
                  verdict.level === 'OK'     ? 'verdict-ok' :
                  verdict.level === 'Weak'   ? 'verdict-weak' :
                                                'verdict-avoid';
                return (
                  <tr key={strategy}>
                    <td className="mc-cmp-strategy">{strategy}</td>
                    <td>
                      <span className={`mc-bias-pill bias-${bias.toLowerCase()}`}>
                        {bias}
                      </span>
                    </td>
                    <td className="mc-cmp-legs">{summary}</td>
                    <td className={`numeric ${popClass}`}>{fmtPct(analysis.pop)}</td>
                    <td className={`numeric ${evClass}`}>{fmt$(analysis.meanPnl)}</td>
                    <td className="numeric text-red">{fmt$(analysis.var95)}</td>
                    <td className="numeric">{fmtRR(rr)}</td>
                    <td>
                      <span
                        className={`mc-verdict-pill ${verdictClass}`}
                        title={verdict.rationale}
                      >
                        {verdict.level}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="mc-cmp-empty">
                    No strategies match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mc-cmp-footnote">
          Strikes auto-selected at ATM / 5% / 10% OTM; premiums priced via Black-Scholes.
          All 12 strategies evaluated on the same simulated price paths (same seed).
          Calendar Spread is excluded — requires BS re-pricing at front expiry.
        </div>
      </ResultCard>
    </>
  );
}
