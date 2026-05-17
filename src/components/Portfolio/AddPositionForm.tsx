import { useState } from 'react';
import { ticker } from '../../api/client';
import { newStockPosition, type StockPosition } from '../../utils/portfolioStorage';
import type { QuoteData } from '../../api/types';

interface Props {
  existingSymbols: string[];
  onAdd: (position: StockPosition, initialQuote: QuoteData) => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function AddPositionForm({ existingSymbols, onAdd }: Props) {
  const [symbol, setSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [addedAt, setAddedAt] = useState(todayISO);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setSymbol('');
    setShares('');
    setAvgPrice('');
    setAddedAt(todayISO());
    setError(null);
  }

  async function handleAdd() {
    const sym = symbol.trim().toUpperCase();
    const sharesNum = parseFloat(shares);
    const priceNum = parseFloat(avgPrice);
    const today = todayISO();
    const dateRaw = addedAt.trim();
    const dateClean = dateRaw && dateRaw <= today ? dateRaw : today;

    if (!sym) { setError('Enter a symbol'); return; }
    if (!isFinite(sharesNum) || sharesNum <= 0) { setError('Shares must be > 0'); return; }
    if (!isFinite(priceNum) || priceNum <= 0) { setError('Purchase price must be > 0'); return; }
    if (existingSymbols.includes(sym)) { setError(`${sym} already in portfolio`); return; }

    setSubmitting(true);
    setError(null);
    try {
      const quote = await ticker.getQuote(sym);
      const position = newStockPosition(sym, sharesNum, priceNum, dateClean);
      onAdd(position, quote);
      reset();
    } catch {
      setError(`"${sym}" not found`);
    } finally {
      setSubmitting(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleAdd();
  }

  return (
    <div className="portfolio-add-row">
      <input
        className="portfolio-input portfolio-input-sym"
        value={symbol}
        onChange={e => { setSymbol(e.target.value.toUpperCase()); setError(null); }}
        onKeyDown={handleKey}
        placeholder="Symbol (e.g. AAPL, BTC-USD)"
        maxLength={12}
        disabled={submitting}
        spellCheck={false}
      />
      <input
        className="portfolio-input"
        type="number"
        min="0"
        step="any"
        value={shares}
        onChange={e => { setShares(e.target.value); setError(null); }}
        onKeyDown={handleKey}
        placeholder="Shares"
        disabled={submitting}
      />
      <input
        className="portfolio-input"
        type="number"
        min="0"
        step="any"
        value={avgPrice}
        onChange={e => { setAvgPrice(e.target.value); setError(null); }}
        onKeyDown={handleKey}
        placeholder="Purchase $"
        disabled={submitting}
      />
      <div
        className="portfolio-add-date"
        title="Date acquired — if bought across multiple dates, use the earliest"
      >
        <span className="portfolio-add-date-label">Acquired</span>
        <input
          className="portfolio-input portfolio-add-date-input"
          type="date"
          max={todayISO()}
          value={addedAt}
          onChange={e => { setAddedAt(e.target.value); setError(null); }}
          onKeyDown={handleKey}
          disabled={submitting}
        />
      </div>
      <button
        className="portfolio-add-btn"
        onClick={handleAdd}
        disabled={submitting || !symbol.trim() || !shares || !avgPrice}
      >
        {submitting ? '…' : '+ Add Position'}
      </button>
      {error && <span className="portfolio-error">{error}</span>}
    </div>
  );
}
