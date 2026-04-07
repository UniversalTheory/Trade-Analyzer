import { useState, useEffect, useCallback } from 'react';
import { ticker } from '../../api/client';
import type { QuoteData } from '../../api/types';

const STORAGE_KEY = 'watchlist_symbols';

interface Props {
  refreshKey: number;
}

function loadSymbols(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveSymbols(symbols: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
}

function fmt(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function WatchlistPanel({ refreshKey }: Props) {
  const [symbols, setSymbols] = useState<string[]>(loadSymbols);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const fetchQuotes = useCallback(async (syms: string[]) => {
    if (!syms.length) return;
    setLoading(true);
    const results = await Promise.allSettled(
      syms.map(sym => ticker.getQuote(sym).then(q => ({ sym, q })))
    );
    const map: Record<string, QuoteData> = {};
    results.forEach(r => {
      if (r.status === 'fulfilled') map[r.value.sym] = r.value.q;
    });
    setQuotes(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchQuotes(symbols);
  }, [fetchQuotes, symbols, refreshKey]);

  function handleRemove(sym: string) {
    const next = symbols.filter(s => s !== sym);
    setSymbols(next);
    saveSymbols(next);
    setQuotes(prev => {
      const copy = { ...prev };
      delete copy[sym];
      return copy;
    });
  }

  async function handleAdd() {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    if (symbols.includes(sym)) {
      setAddError('Already in watchlist');
      return;
    }
    setAdding(true);
    setAddError(null);
    try {
      const q = await ticker.getQuote(sym);
      const next = [...symbols, sym];
      setSymbols(next);
      saveSymbols(next);
      setQuotes(prev => ({ ...prev, [sym]: q }));
      setInput('');
    } catch {
      setAddError(`"${sym}" not found`);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="panel-card watchlist-panel">
      <div className="watchlist-header">
        <div className="watchlist-title-row">
          <span className="section-heading watchlist-heading">Watchlist</span>
          {symbols.length > 0 && (
            <span className="global-panel-subtitle">
              {symbols.length} symbol{symbols.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="watchlist-add-row">
          <input
            className="watchlist-input"
            value={input}
            onChange={e => { setInput(e.target.value.toUpperCase()); setAddError(null); }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Add symbol…"
            maxLength={10}
            disabled={adding}
          />
          <button
            className="watchlist-add-btn"
            onClick={handleAdd}
            disabled={adding || !input.trim()}
          >
            {adding ? '…' : '+ Add'}
          </button>
          {addError && <span className="watchlist-error">{addError}</span>}
        </div>
      </div>

      {symbols.length === 0 ? (
        <div className="watchlist-empty">
          No symbols added yet — type a ticker above and press Enter to get started.
        </div>
      ) : (
        <div className="global-table">
          <div className="watchlist-table-head">
            <span>Symbol</span>
            <span className="ta-right">Open</span>
            <span className="ta-right">High</span>
            <span className="ta-right">Low</span>
            <span className="ta-right">Price</span>
            <span className="ta-right">Chg%</span>
            <span />
          </div>
          {symbols.map(sym => {
            const q = quotes[sym];
            const up = q ? q.changePercent >= 0 : null;
            const color = up === null
              ? 'var(--text-muted)'
              : up ? 'var(--color-green)' : 'var(--color-red)';
            return (
              <div key={sym} className="watchlist-table-row">
                <div className="global-row-name">
                  <span className="global-row-label">{sym}</span>
                  {q?.name && <span className="global-row-sub">{q.name}</span>}
                </div>
                <span className="global-row-price ta-right">
                  {q ? `$${fmt(q.open)}` : '—'}
                </span>
                <span className="global-row-price ta-right" style={{ color: 'var(--color-green)' }}>
                  {q ? `$${fmt(q.high)}` : '—'}
                </span>
                <span className="global-row-price ta-right" style={{ color: 'var(--color-red)' }}>
                  {q ? `$${fmt(q.low)}` : '—'}
                </span>
                <span className="global-row-price ta-right">
                  {q ? `$${fmt(q.price)}` : '—'}
                </span>
                <span className="global-row-change ta-right" style={{ color }}>
                  {q ? `${up ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                </span>
                <button
                  className="watchlist-remove-btn"
                  onClick={() => handleRemove(sym)}
                  title="Remove from watchlist"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
