import { useState, useEffect } from 'react';
import { ticker as tickerApi } from '../../api/client';
import type { OptionsChainData, OptionContract } from '../../api/types';

interface Props {
  symbol: string;
  currentPrice: number;
  onAnalyze: (contract: OptionContract) => void;
}

function formatIV(iv: number): string {
  return `${(iv * 100).toFixed(1)}%`;
}

function fmt(n: number, dec = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function ContractRow({
  contract,
  currentPrice,
  onAnalyze,
}: {
  contract: OptionContract;
  currentPrice: number;
  onAnalyze: (c: OptionContract) => void;
}) {
  const itm = contract.inTheMoney;
  return (
    <tr className={`options-row ${itm ? 'itm' : 'otm'}`}>
      <td className="options-cell strike">{fmt(contract.strike)}</td>
      <td className="options-cell">{fmt(contract.lastPrice, 2)}</td>
      <td className="options-cell">{fmt(contract.bid, 2)}</td>
      <td className="options-cell">{fmt(contract.ask, 2)}</td>
      <td className="options-cell iv">{formatIV(contract.impliedVolatility)}</td>
      <td className="options-cell">{contract.volume?.toLocaleString() ?? '—'}</td>
      <td className="options-cell">{contract.openInterest?.toLocaleString() ?? '—'}</td>
      <td className="options-cell">
        <button
          className="analyze-link-btn"
          onClick={() => onAnalyze(contract)}
          title="Open in Black-Scholes calculator"
        >
          ↗ Analyze
        </button>
      </td>
    </tr>
  );
}

export default function OptionsChain({ symbol, currentPrice, onAnalyze }: Props) {
  const [chain, setChain] = useState<OptionsChainData | null>(null);
  const [expirations, setExpirations] = useState<string[]>([]);
  const [selectedExp, setSelectedExp] = useState<string>('');
  const [side, setSide] = useState<'calls' | 'puts'>('calls');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load first expiration on mount / symbol change
  useEffect(() => {
    setChain(null);
    setExpirations([]);
    setSelectedExp('');
    setError('');
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    setError('');
    tickerApi
      .getOptions(symbol, selectedExp || undefined)
      .then(data => {
        setChain(data);
        // Build expiration list from data (backend may return available expirations)
        if (!selectedExp && data.expirationDate) {
          setSelectedExp(data.expirationDate);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [symbol, selectedExp]);

  const contracts = chain ? chain[side] : [];
  // Filter to near-the-money strikes (±20% of current price)
  const filtered = contracts.filter(
    c => c.strike >= currentPrice * 0.8 && c.strike <= currentPrice * 1.2,
  );

  return (
    <div className="options-chain-card">
      <div className="options-chain-header">
        <div className="options-chain-title">Options Chain</div>
        <div className="options-chain-controls">
          {selectedExp && (
            <input
              type="date"
              className="exp-input"
              value={selectedExp}
              onChange={e => setSelectedExp(e.target.value)}
            />
          )}
          <div className="toggle-group small">
            {(['calls', 'puts'] as const).map(s => (
              <button
                key={s}
                className={`toggle-btn ${side === s ? 'active' : ''}`}
                onClick={() => setSide(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {loading ? (
        <div className="loading-row">
          <div className="spinner" />
          <span>Loading options chain…</span>
        </div>
      ) : filtered.length === 0 && chain ? (
        <div className="empty-state small">
          <div className="empty-desc">No contracts found near current price for this expiration.</div>
        </div>
      ) : (
        <div className="options-table-wrap">
          <table className="options-table">
            <thead>
              <tr>
                <th>Strike</th>
                <th>Last</th>
                <th>Bid</th>
                <th>Ask</th>
                <th>IV</th>
                <th>Volume</th>
                <th>OI</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => (
                <ContractRow
                  key={`${c.strike}-${i}`}
                  contract={c}
                  currentPrice={currentPrice}
                  onAnalyze={onAnalyze}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
