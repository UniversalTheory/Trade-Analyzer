import { useState } from 'react';
import type { StockPosition } from '../../utils/portfolioStorage';

export interface PositionEdit {
  shares: number;
  avgPrice: number;
  addedAt: string;
}

interface Props {
  position: StockPosition;
  onSave: (id: string, patch: PositionEdit) => void;
  onCancel: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function EditPositionRow({ position, onSave, onCancel }: Props) {
  const [shares, setShares] = useState(String(position.shares));
  const [avgPrice, setAvgPrice] = useState(String(position.avgPrice));
  const [addedAt, setAddedAt] = useState(position.addedAt || todayISO());
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const sharesNum = parseFloat(shares);
    const priceNum = parseFloat(avgPrice);
    const today = todayISO();
    const dateRaw = addedAt.trim();
    const dateClean = dateRaw && dateRaw <= today ? dateRaw : today;

    if (!isFinite(sharesNum) || sharesNum <= 0) { setError('Shares must be > 0'); return; }
    if (!isFinite(priceNum) || priceNum <= 0) { setError('Trade price must be > 0'); return; }

    onSave(position.id, { shares: sharesNum, avgPrice: priceNum, addedAt: dateClean });
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') onCancel();
  }

  return (
    <div className="portfolio-table-row portfolio-edit-row">
      <span className="global-row-label">{position.symbol}</span>

      <input
        className="portfolio-input portfolio-edit-input"
        type="number"
        min="0"
        step="any"
        value={shares}
        onChange={e => { setShares(e.target.value); setError(null); }}
        onKeyDown={handleKey}
        autoFocus
        placeholder="Shares"
      />

      <input
        className="portfolio-input portfolio-edit-input"
        type="number"
        min="0"
        step="any"
        value={avgPrice}
        onChange={e => { setAvgPrice(e.target.value); setError(null); }}
        onKeyDown={handleKey}
        placeholder="Trade $"
      />

      <div className="portfolio-edit-date-wrap" title="Acquired date">
        <span className="portfolio-edit-date-label">Acquired</span>
        <input
          className="portfolio-input portfolio-edit-date-input"
          type="date"
          max={todayISO()}
          value={addedAt}
          onChange={e => { setAddedAt(e.target.value); setError(null); }}
          onKeyDown={handleKey}
        />
      </div>

      <div className="portfolio-edit-actions">
        <button
          className="portfolio-edit-save-btn"
          onClick={handleSave}
          title="Save (Enter)"
        >
          ✓
        </button>
        <button
          className="portfolio-edit-cancel-btn"
          onClick={onCancel}
          title="Cancel (Esc)"
        >
          ×
        </button>
      </div>

      {error && <div className="portfolio-edit-error">{error}</div>}
    </div>
  );
}
