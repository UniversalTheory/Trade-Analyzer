import type { QuoteData } from '../../api/types';
import LoadingState from '../common/LoadingState';

interface Props {
  quotes: QuoteData[];
  loading: boolean;
}

const FUTURES_META: Record<string, { name: string; short: string }> = {
  'ES=F': { name: 'S&P 500 Futures', short: 'ES' },
  'YM=F': { name: 'Dow Futures',     short: 'YM' },
  'NQ=F': { name: 'Nasdaq Futures',  short: 'NQ' },
};

function fmt(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function FuturesPanel({ quotes, loading }: Props) {
  return (
    <div className="global-panel">
      <div className="global-panel-header">
        <span className="global-panel-title">Futures</span>
        <span className="global-panel-subtitle">US Equity</span>
      </div>

      {loading && quotes.length === 0 ? (
        <LoadingState rows={3} height={18} />
      ) : (
        <div className="global-table">
          <div className="global-table-head">
            <span>Contract</span>
            <span className="ta-right">Price</span>
            <span className="ta-right">Chg%</span>
          </div>
          {quotes.map(q => {
            const meta = FUTURES_META[q.symbol];
            const up = q.changePercent >= 0;
            const color = up ? 'var(--color-green)' : 'var(--color-red)';
            return (
              <div key={q.symbol} className="global-table-row">
                <div className="global-row-name">
                  <span className="global-row-label">{meta?.name ?? q.symbol}</span>
                  <span className="global-row-sub">{meta?.short ?? q.symbol}</span>
                </div>
                <span className="global-row-price ta-right">{fmt(q.price)}</span>
                <span className="global-row-change ta-right" style={{ color }}>
                  {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
