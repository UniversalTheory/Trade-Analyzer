import { useMemo, useState } from 'react';
import { AnimatedNumber } from '../AnimatedNumber';
import EditPositionRow, { type PositionEdit } from './EditPositionRow';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import type { QuoteData } from '../../api/types';
import {
  computePositionMetrics,
  fmtUSD,
  fmtPct,
  signed,
} from '../../utils/portfolioCalc';

interface Props {
  positions: PortfolioPosition[];
  quotes: Record<string, QuoteData>;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: PositionEdit) => void;
  onShowInResearch?: (symbol: string) => void;
}

type SortCol = 'shares' | 'trade' | 'current' | 'day' | 'pl' | 'plPct';
type SortState = { col: SortCol; dir: 'asc' | 'desc' };

export default function PortfolioTable({ positions, quotes, onRemove, onUpdate, onShowInResearch }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  // In-memory only — sort resets to insertion order on reload.
  const [sort, setSort] = useState<SortState | null>(null);

  function toggleSort(col: SortCol) {
    setSort(prev =>
      prev?.col === col
        ? { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
        : { col, dir: 'desc' },
    );
  }

  const sortedPositions = useMemo(() => {
    if (!sort) return positions;
    const valueFor = (p: PortfolioPosition): number | null => {
      const quote = quotes[p.symbol];
      const metrics = computePositionMetrics(p, quote?.price);
      switch (sort.col) {
        case 'shares':  return p.shares;
        case 'trade':   return p.avgPrice;
        case 'current': return quote?.price ?? null;
        case 'day':     return quote?.changePercent ?? null;
        case 'pl':      return metrics?.pl ?? null;
        case 'plPct':   return metrics?.plPct ?? null;
      }
    };
    return [...positions].sort((a, b) => {
      const av = valueFor(a);
      const bv = valueFor(b);
      // Unpriced positions always sink to the bottom, regardless of direction.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sort.dir === 'desc' ? bv - av : av - bv;
    });
  }, [positions, quotes, sort]);

  function SortHeader({ col, label }: { col: SortCol; label: string }) {
    const active = sort?.col === col;
    return (
      <span
        className={`ta-right portfolio-sort-header${active ? ' is-active' : ''}`}
        onClick={() => toggleSort(col)}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(col); }
        }}
      >
        {label}
        <span className="portfolio-sort-arrow">{active ? (sort!.dir === 'desc' ? '▼' : '▲') : ''}</span>
      </span>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="portfolio-empty">
        No positions yet — add a ticker above to get started.
      </div>
    );
  }

  function handleSave(id: string, patch: PositionEdit) {
    onUpdate(id, patch);
    setEditingId(null);
  }

  return (
    <div className="global-table portfolio-table">
      <div className="portfolio-table-head">
        <span>Ticker</span>
        <SortHeader col="shares" label="Shares" />
        <SortHeader col="trade" label="Trade $" />
        <SortHeader col="current" label="Current $" />
        <SortHeader col="day" label="Day Change" />
        <SortHeader col="pl" label="P/L $" />
        <SortHeader col="plPct" label="P/L %" />
        <span />
      </div>

      {sortedPositions.map(p => {
        if (editingId === p.id && (p.type === 'stock' || p.type === 'fund')) {
          return (
            <EditPositionRow
              key={p.id}
              position={p}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
            />
          );
        }

        const quote = quotes[p.symbol];
        const currentPrice = quote?.price;
        const metrics = computePositionMetrics(p, currentPrice);
        const plColor = !metrics
          ? 'var(--text-muted)'
          : metrics.pl >= 0 ? 'var(--color-green)' : 'var(--color-red)';
        const dayChangePct = quote?.changePercent;
        const dayColor = dayChangePct === undefined
          ? 'var(--text-muted)'
          : dayChangePct >= 0 ? 'var(--color-green)' : 'var(--color-red)';

        const clickable = !!onShowInResearch;
        return (
          <div
            key={p.id}
            className={`portfolio-table-row${clickable ? ' clickable-asset-row' : ''}`}
            onClick={clickable ? () => onShowInResearch!(p.symbol) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable
              ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowInResearch!(p.symbol); } }
              : undefined}
          >
            <div className="global-row-name">
              <span className="portfolio-row-label-line">
                <span className="global-row-label">{p.symbol}</span>
                {p.type === 'fund' && (
                  <span
                    className={`portfolio-fund-badge portfolio-fund-badge--${p.fundKind}`}
                    title={p.fundKind === 'mutual'
                      ? 'Mutual fund — priced at daily NAV'
                      : 'Exchange-traded fund'}
                  >
                    {p.fundKind === 'mutual' ? 'FUND' : 'ETF'}
                  </span>
                )}
              </span>
              {quote?.name && <span className="global-row-sub">{quote.name}</span>}
            </div>

            <span className="global-row-price ta-right">{p.shares.toLocaleString('en-US')}</span>

            <span className="global-row-price ta-right">${fmtUSD(p.avgPrice)}</span>

            <span className="global-row-price ta-right">
              {currentPrice !== undefined
                ? <AnimatedNumber value={currentPrice} format={fmtUSD} prefix="$" />
                : '—'}
            </span>

            <span className="global-row-change ta-right" style={{ color: dayColor }}>
              {dayChangePct !== undefined
                ? <AnimatedNumber
                    value={dayChangePct}
                    format={n => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`}
                  />
                : '—'}
            </span>

            <span className="global-row-change ta-right" style={{ color: plColor }}>
              {metrics
                ? `${signed(metrics.pl)}$${fmtUSD(Math.abs(metrics.pl))}`
                : '—'}
            </span>

            <span className="global-row-change ta-right" style={{ color: plColor }}>
              {metrics ? `${signed(metrics.pl)}${fmtPct(metrics.plPct)}` : '—'}
            </span>

            <div className="portfolio-row-actions" onClick={e => e.stopPropagation()}>
              <button
                className="portfolio-edit-btn"
                onClick={() => setEditingId(p.id)}
                title="Edit position"
              >
                ✎
              </button>
              <button
                className="portfolio-remove-btn"
                onClick={() => onRemove(p.id)}
                title="Remove position"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
