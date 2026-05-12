import { useMemo, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import ResultCard from '../common/ResultCard';
import ResultItem from '../common/ResultItem';
import {
  type BacktestResult, type BacktestAggregates,
  type Cadence, equityCurve, plHistogram,
} from '../../utils/backtest';
import type { StrategyId } from '../../utils/strategyPayoff';
import type { StrategyBias } from '../../utils/strikeSelector';

// ── Payload types — wired into MonteCarloSimulation.tsx ──────────────────────

export interface BacktestSinglePayload {
  scope: 'single';
  symbol: string;
  strategy: StrategyId;
  result: BacktestResult;
  lookback: string;          // e.g. '5y'
  dteDays: number;
  cadence: Cadence;
  elapsedMs: number;
  barsLoaded: number;
}

export interface BacktestCompareRow {
  strategy: StrategyId;
  bias: StrategyBias;
  aggregates: BacktestAggregates;
}

export interface BacktestComparePayload {
  scope: 'compare';
  symbol: string;
  rows: BacktestCompareRow[];
  lookback: string;
  dteDays: number;
  cadence: Cadence;
  elapsedMs: number;
  barsLoaded: number;
  windowsPerStrategy: number;
}

export type BacktestPayload = BacktestSinglePayload | BacktestComparePayload;

// ── Formatting ───────────────────────────────────────────────────────────────

function fmt$(n: number, decimals = 2): string {
  if (!isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  })}`;
}

function fmtPct(x: number, decimals = 1): string {
  if (!isFinite(x)) return '—';
  return `${(x * 100).toFixed(decimals)}%`;
}

function fmtRR(rr: number): string {
  if (!Number.isFinite(rr)) return '∞';
  if (rr === 0) return '—';
  return rr.toFixed(2);
}

function fmtNum(n: number, decimals = 2): string {
  if (!isFinite(n)) return '—';
  return n.toFixed(decimals);
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ── Single-scope view ────────────────────────────────────────────────────────

function SingleView({ payload }: { payload: BacktestSinglePayload }) {
  const { result, symbol, strategy, lookback, dteDays, cadence, elapsedMs, barsLoaded } = payload;
  const { windows, aggregates, skipped } = result;
  const [showTable, setShowTable] = useState(false);

  const equity = useMemo(() => {
    const curve = equityCurve(windows);
    // Per share → per contract
    return curve.map(p => ({ date: p.date, cum: p.cum * 100, label: shortDate(p.date) }));
  }, [windows]);

  const histo = useMemo(() => {
    const bins = plHistogram(windows, 24);
    return bins.map(b => ({ x: b.x * 100, count: b.count }));
  }, [windows]);

  const best  = aggregates.bestWindowIdx  >= 0 ? windows[aggregates.bestWindowIdx]  : null;
  const worst = aggregates.worstWindowIdx >= 0 ? windows[aggregates.worstWindowIdx] : null;

  const winClass  = aggregates.winRate >= 0.5 ? 'text-green' : 'text-red';
  const plClass   = aggregates.avgPL   >= 0   ? 'text-green' : 'text-red';
  const totalClass = aggregates.totalPL >= 0  ? 'text-green' : 'text-red';

  return (
    <>
      <ResultCard title={`Backtest · ${symbol} · ${strategy}`}>
        <div className="mc-cmp-meta">
          <span>{lookback.toUpperCase()} lookback</span>
          <span>{dteDays} DTE</span>
          <span>{cadence} entries</span>
          <span>{aggregates.windows} windows</span>
          <span>{barsLoaded} bars</span>
          <span>{elapsedMs.toFixed(0)} ms</span>
          {skipped > 0 && <span>{skipped} skipped (no exit bar)</span>}
        </div>
      </ResultCard>

      <ResultCard title="Aggregate Performance (per contract)">
        <ResultItem
          label="Win Rate"
          value={fmtPct(aggregates.winRate)}
          sub={`${Math.round(aggregates.winRate * aggregates.windows)} / ${aggregates.windows} wins`}
          valueClass={winClass}
        />
        <ResultItem
          label="Total P/L"
          value={fmt$(aggregates.totalPL * 100, 0)}
          sub={`cumulative across ${aggregates.windows} windows`}
          valueClass={totalClass}
        />
        <ResultItem
          label="Avg P/L"
          value={fmt$(aggregates.avgPL * 100, 0)}
          sub={`median ${fmt$(aggregates.medianPL * 100, 0)}`}
          valueClass={plClass}
        />
        <ResultItem
          label="Sharpe (annualised)"
          value={fmtNum(aggregates.sharpe)}
          sub={`σ ${fmt$(aggregates.stdPL * 100, 0)} per window`}
        />
        <ResultItem
          label="Max Drawdown"
          value={fmt$(aggregates.maxDrawdown * 100, 0)}
          valueClass="text-red"
        />
        <ResultItem
          label="Risk / Reward"
          value={fmtRR(aggregates.rr)}
          sub={`win ${fmt$(aggregates.avgWin * 100, 0)} / loss ${fmt$(aggregates.avgLoss * 100, 0)}`}
        />
        <ResultItem
          label="Brier Score (calibration)"
          value={fmtNum(aggregates.brierScore, 3)}
          sub="lower = MC POP closer to realized outcome"
        />
      </ResultCard>

      <ResultCard title="Equity Curve (cumulative P/L per contract)">
        <div className="mc-chart">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={equity} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={55}
                tickFormatter={(v) => fmt$(Number(v), 0)}
              />
              <Tooltip
                contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border)', fontSize: 12 }}
                formatter={(v: any) => [fmt$(Number(v), 0), 'Cumulative P/L']}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="cum"
                stroke={aggregates.totalPL >= 0 ? '#10b981' : '#ef4444'}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ResultCard>

      <ResultCard title="Per-Window P/L Distribution (per contract)">
        <div className="mc-chart">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={histo} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="btHistoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="x"
                tickFormatter={(v) => fmt$(Number(v), 0)}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border)', fontSize: 12 }}
                labelFormatter={(v) => `P/L bucket: ${fmt$(Number(v), 0)}`}
                formatter={(v: any) => [`${v} windows`, 'Count']}
              />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="count" stroke="#38bdf8" strokeWidth={2} fill="url(#btHistoGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ResultCard>

      {(best || worst) && (
        <ResultCard title="Best / Worst Windows">
          <div className="bt-callouts">
            {best && (
              <div className="bt-callout bt-callout-best">
                <div className="bt-callout-head">Best · {fmt$(best.realizedPL * 100, 0)}</div>
                <div className="bt-callout-row">
                  <span>Entry</span><span>{shortDate(best.entryDate)} @ {fmt$(best.entrySpot, 2)}</span>
                </div>
                <div className="bt-callout-row">
                  <span>Exit</span><span>{shortDate(best.exitDate)} @ {fmt$(best.exitSpot, 2)}</span>
                </div>
                <div className="bt-callout-row">
                  <span>Trailing σ</span><span>{fmtPct(best.trailingVol)}</span>
                </div>
                <div className="bt-callout-row">
                  <span>MC POP</span><span>{fmtPct(best.predictedPOP)}</span>
                </div>
                <div className="bt-callout-legs">{best.legsSummary}</div>
              </div>
            )}
            {worst && (
              <div className="bt-callout bt-callout-worst">
                <div className="bt-callout-head">Worst · {fmt$(worst.realizedPL * 100, 0)}</div>
                <div className="bt-callout-row">
                  <span>Entry</span><span>{shortDate(worst.entryDate)} @ {fmt$(worst.entrySpot, 2)}</span>
                </div>
                <div className="bt-callout-row">
                  <span>Exit</span><span>{shortDate(worst.exitDate)} @ {fmt$(worst.exitSpot, 2)}</span>
                </div>
                <div className="bt-callout-row">
                  <span>Trailing σ</span><span>{fmtPct(worst.trailingVol)}</span>
                </div>
                <div className="bt-callout-row">
                  <span>MC POP</span><span>{fmtPct(worst.predictedPOP)}</span>
                </div>
                <div className="bt-callout-legs">{worst.legsSummary}</div>
              </div>
            )}
          </div>
        </ResultCard>
      )}

      <ResultCard title={`Per-Window Detail (${windows.length})`}>
        <button
          type="button"
          className="bt-toggle-table"
          onClick={() => setShowTable(s => !s)}
        >
          {showTable ? 'Hide table' : 'Show table'}
        </button>
        {showTable && (
          <div className="mc-cmp-table-wrap">
            <table className="mc-cmp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th className="numeric">Entry $</th>
                  <th className="numeric">Exit $</th>
                  <th className="numeric">Trail σ</th>
                  <th className="numeric">MC POP</th>
                  <th className="numeric">Realized P/L</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((w, i) => {
                  const plClass = w.realizedPL >= 0 ? 'text-green' : 'text-red';
                  return (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{shortDate(w.entryDate)}</td>
                      <td>{shortDate(w.exitDate)}</td>
                      <td className="numeric">{fmt$(w.entrySpot, 2)}</td>
                      <td className="numeric">{fmt$(w.exitSpot, 2)}</td>
                      <td className="numeric">{fmtPct(w.trailingVol)}</td>
                      <td className="numeric">{fmtPct(w.predictedPOP)}</td>
                      <td className={`numeric ${plClass}`}>{fmt$(w.realizedPL * 100, 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ResultCard>
    </>
  );
}

// ── Compare-scope view ──────────────────────────────────────────────────────

type CmpSortKey = 'strategy' | 'bias' | 'winRate' | 'totalPL' | 'avgPL' | 'sharpe' | 'maxDD' | 'rr' | 'brier';
type SortDir = 'asc' | 'desc';

const BIAS_CHIPS: Array<{ key: StrategyBias | 'All'; label: string }> = [
  { key: 'All',     label: 'All' },
  { key: 'Bullish', label: 'Bullish' },
  { key: 'Bearish', label: 'Bearish' },
  { key: 'Neutral', label: 'Neutral' },
];

function getCmpSortValue(row: BacktestCompareRow, key: CmpSortKey): number | string {
  const a = row.aggregates;
  switch (key) {
    case 'strategy': return row.strategy;
    case 'bias':     return row.bias;
    case 'winRate':  return a.winRate;
    case 'totalPL':  return a.totalPL;
    case 'avgPL':    return a.avgPL;
    case 'sharpe':   return isFinite(a.sharpe) ? a.sharpe : -Number.MAX_SAFE_INTEGER;
    case 'maxDD':    return -a.maxDrawdown;       // lower drawdown is better → invert
    case 'rr':       return Number.isFinite(a.rr) ? a.rr : Number.MAX_SAFE_INTEGER;
    case 'brier':    return -a.brierScore;        // lower brier is better → invert for desc-sorted "best"
  }
}

function CompareView({ payload }: { payload: BacktestComparePayload }) {
  const { rows, symbol, lookback, dteDays, cadence, elapsedMs, barsLoaded, windowsPerStrategy } = payload;
  const [biasFilter, setBiasFilter] = useState<StrategyBias | 'All'>('All');
  const [sortKey, setSortKey] = useState<CmpSortKey>('totalPL');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const visible = useMemo(() => {
    const filtered = biasFilter === 'All'
      ? rows
      : rows.filter(r => r.bias === biasFilter);
    const sorted = [...filtered].sort((a, b) => {
      const av = getCmpSortValue(a, sortKey);
      const bv = getCmpSortValue(b, sortKey);
      let cmp: number;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, biasFilter, sortKey, sortDir]);

  function handleSort(key: CmpSortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      const defaultDesc: CmpSortKey[] = ['winRate', 'totalPL', 'avgPL', 'sharpe', 'maxDD', 'rr', 'brier'];
      setSortDir(defaultDesc.includes(key) ? 'desc' : 'asc');
    }
  }

  const sortIndicator = (key: CmpSortKey): string => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <>
      <ResultCard title={`Backtest · ${symbol} · Compare All`}>
        <div className="mc-cmp-meta">
          <span>{lookback.toUpperCase()} lookback</span>
          <span>{dteDays} DTE</span>
          <span>{cadence} entries</span>
          <span>{windowsPerStrategy} windows / strategy</span>
          <span>{barsLoaded} bars</span>
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
                <th className="sortable numeric" onClick={() => handleSort('winRate')}>
                  Win %{sortIndicator('winRate')}
                </th>
                <th className="sortable numeric" onClick={() => handleSort('totalPL')}>
                  Total P/L{sortIndicator('totalPL')}
                </th>
                <th className="sortable numeric" onClick={() => handleSort('avgPL')}>
                  Avg P/L{sortIndicator('avgPL')}
                </th>
                <th className="sortable numeric" onClick={() => handleSort('sharpe')}>
                  Sharpe{sortIndicator('sharpe')}
                </th>
                <th className="sortable numeric" onClick={() => handleSort('maxDD')}>
                  Max DD{sortIndicator('maxDD')}
                </th>
                <th className="sortable numeric" onClick={() => handleSort('rr')}>
                  R:R{sortIndicator('rr')}
                </th>
                <th className="sortable numeric" onClick={() => handleSort('brier')}>
                  Brier{sortIndicator('brier')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map(row => {
                const a = row.aggregates;
                const winClass = a.winRate >= 0.5 ? 'text-green' : 'text-red';
                const totalClass = a.totalPL >= 0 ? 'text-green' : 'text-red';
                const avgClass = a.avgPL >= 0 ? 'text-green' : 'text-red';
                return (
                  <tr key={row.strategy}>
                    <td className="mc-cmp-strategy">{row.strategy}</td>
                    <td>
                      <span className={`mc-bias-pill bias-${row.bias.toLowerCase()}`}>
                        {row.bias}
                      </span>
                    </td>
                    <td className={`numeric ${winClass}`}>{fmtPct(a.winRate)}</td>
                    <td className={`numeric ${totalClass}`}>{fmt$(a.totalPL * 100, 0)}</td>
                    <td className={`numeric ${avgClass}`}>{fmt$(a.avgPL * 100, 0)}</td>
                    <td className="numeric">{fmtNum(a.sharpe)}</td>
                    <td className="numeric text-red">{fmt$(a.maxDrawdown * 100, 0)}</td>
                    <td className="numeric">{fmtRR(a.rr)}</td>
                    <td className="numeric">{fmtNum(a.brierScore, 3)}</td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="mc-cmp-empty">
                    No strategies match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mc-cmp-footnote">
          Each row reflects {windowsPerStrategy} non-overlapping {cadence}-spaced entries.
          At each entry, strikes are auto-picked using trailing realized vol and BS-priced premiums;
          realized P/L is measured at the bar nearest entry + DTE calendar days. Calendar Spread is excluded.
        </div>
      </ResultCard>
    </>
  );
}

// ── Dispatcher ──────────────────────────────────────────────────────────────

export default function MonteCarloBacktest({ payload }: { payload: BacktestPayload }) {
  if (payload.scope === 'single') return <SingleView payload={payload} />;
  return <CompareView payload={payload} />;
}
