import { useState } from 'react';
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

export default function PortfolioTable({ positions, quotes, onRemove, onUpdate, onShowInResearch }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

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
        <span className="ta-right">Shares</span>
        <span className="ta-right">Trade $</span>
        <span className="ta-right">Current $</span>
        <span className="ta-right">Day Change</span>
        <span className="ta-right">P/L $</span>
        <span className="ta-right">P/L %</span>
        <span />
      </div>

      {positions.map(p => {
        if (editingId === p.id && p.type === 'stock') {
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
              <span className="global-row-label">{p.symbol}</span>
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
