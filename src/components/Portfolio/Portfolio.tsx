import { useState, useEffect, useCallback, useRef } from 'react';
import AddPositionForm from './AddPositionForm';
import PortfolioTable from './PortfolioTable';
import { AnimatedNumber } from '../AnimatedNumber';
import { ticker } from '../../api/client';
import type { QuoteData } from '../../api/types';
import {
  loadPortfolio,
  savePortfolio,
  type PortfolioState,
  type StockPosition,
} from '../../utils/portfolioStorage';
import {
  computePortfolioTotals,
  fmtUSD,
  fmtPct,
  signed,
} from '../../utils/portfolioCalc';

const REFRESH_INTERVAL_MS = 30_000;

export default function Portfolio() {
  const [state, setState] = useState<PortfolioState>(loadPortfolio);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [cashInput, setCashInput] = useState(String(state.cash || ''));
  const cashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist on every state change.
  useEffect(() => {
    savePortfolio(state);
  }, [state]);

  const fetchQuotes = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }
    setRefreshing(true);
    const results = await Promise.allSettled(
      symbols.map(sym => ticker.getQuote(sym).then(q => ({ sym, q }))),
    );
    setQuotes(prev => {
      const next = { ...prev };
      // Drop quotes for symbols that no longer exist.
      for (const sym of Object.keys(next)) {
        if (!symbols.includes(sym)) delete next[sym];
      }
      for (const r of results) {
        if (r.status === 'fulfilled') next[r.value.sym] = r.value.q;
      }
      return next;
    });
    setRefreshing(false);
  }, []);

  // Initial fetch + when positions list changes.
  const symbolsKey = state.positions.map(p => p.symbol).join(',');
  useEffect(() => {
    fetchQuotes(state.positions.map(p => p.symbol));
  }, [fetchQuotes, symbolsKey]);

  // Auto-refresh every 30s.
  useEffect(() => {
    if (state.positions.length === 0) return;
    const id = setInterval(() => {
      fetchQuotes(state.positions.map(p => p.symbol));
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchQuotes, symbolsKey, state.positions.length]);

  function handleAdd(position: StockPosition, initialQuote: QuoteData) {
    setState(s => ({ ...s, positions: [...s.positions, position] }));
    setQuotes(prev => ({ ...prev, [position.symbol]: initialQuote }));
  }

  function handleRemove(id: string) {
    setState(s => {
      const removed = s.positions.find(p => p.id === id);
      const next = s.positions.filter(p => p.id !== id);
      if (removed) {
        setQuotes(prev => {
          const copy = { ...prev };
          delete copy[removed.symbol];
          return copy;
        });
      }
      return { ...s, positions: next };
    });
  }

  function handleCashChange(raw: string) {
    setCashInput(raw);
    const num = parseFloat(raw);
    const safe = isFinite(num) && num >= 0 ? num : 0;
    if (cashTimer.current) clearTimeout(cashTimer.current);
    cashTimer.current = setTimeout(() => {
      setState(s => ({ ...s, cash: safe }));
    }, 250);
  }

  const priceBySymbol: Record<string, number | undefined> = {};
  for (const p of state.positions) {
    priceBySymbol[p.symbol] = quotes[p.symbol]?.price;
  }
  const totals = computePortfolioTotals(state.positions, priceBySymbol, state.cash);

  const plColor = totals.totalPL >= 0 ? 'var(--color-green)' : 'var(--color-red)';

  return (
    <div className="portfolio-page">
      <div className="portfolio-header">
        <div>
          <h2 className="portfolio-title">Portfolio</h2>
          <div className="portfolio-subtitle">
            {state.positions.length} position{state.positions.length !== 1 ? 's' : ''}
            {state.positions.length > 0 && ` · auto-refresh 30s`}
          </div>
        </div>
        <button
          className="portfolio-refresh-btn"
          onClick={() => fetchQuotes(state.positions.map(p => p.symbol))}
          disabled={refreshing || state.positions.length === 0}
        >
          {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="panel-card portfolio-card">
        <AddPositionForm
          existingSymbols={state.positions.map(p => p.symbol)}
          onAdd={handleAdd}
        />

        <PortfolioTable
          positions={state.positions}
          quotes={quotes}
          onRemove={handleRemove}
        />

        <div className="portfolio-cash-row">
          <label className="portfolio-cash-label" htmlFor="portfolio-cash-input">
            Cash
          </label>
          <div className="portfolio-cash-input-wrap">
            <span className="portfolio-cash-prefix">$</span>
            <input
              id="portfolio-cash-input"
              className="portfolio-input portfolio-cash-input"
              type="number"
              min="0"
              step="any"
              value={cashInput}
              onChange={e => handleCashChange(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="portfolio-totals">
          <div className="portfolio-totals-row">
            <span className="portfolio-totals-label">Holdings total</span>
            <span className="portfolio-totals-value">
              <AnimatedNumber value={totals.holdingsTotal} format={fmtUSD} prefix="$" />
            </span>
          </div>
          <div className="portfolio-totals-row">
            <span className="portfolio-totals-label">+ Cash</span>
            <span className="portfolio-totals-value">${fmtUSD(state.cash)}</span>
          </div>
          <div className="portfolio-totals-row portfolio-totals-grand">
            <span className="portfolio-totals-label">Total portfolio</span>
            <span className="portfolio-totals-value">
              <AnimatedNumber value={totals.totalPortfolio} format={fmtUSD} prefix="$" />
            </span>
          </div>
          <div className="portfolio-totals-divider" />
          <div className="portfolio-totals-row">
            <span className="portfolio-totals-label">Cost basis</span>
            <span className="portfolio-totals-value">${fmtUSD(totals.totalCostBasis)}</span>
          </div>
          <div className="portfolio-totals-row">
            <span className="portfolio-totals-label">Total P/L</span>
            <span className="portfolio-totals-value" style={{ color: plColor }}>
              {totals.totalCostBasis > 0 ? (
                <>
                  {signed(totals.totalPL)}$<AnimatedNumber value={Math.abs(totals.totalPL)} format={fmtUSD} />
                  {' '}({signed(totals.totalPL)}{fmtPct(totals.totalPLPct)})
                </>
              ) : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
