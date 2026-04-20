import type { QuoteData } from '../../api/types';
import LoadingState from '../common/LoadingState';
import { AnimatedNumber } from '../AnimatedNumber';

interface Props {
  quotes: QuoteData[];
  loading: boolean;
}

const FUTURES_META: Record<string, { name: string; short: string }> = {
  'ES=F':  { name: 'S&P 500 Futures',    short: 'ES'  },
  'YM=F':  { name: 'Dow Futures',        short: 'YM'  },
  'NQ=F':  { name: 'Nasdaq Futures',     short: 'NQ'  },
  'RTY=F': { name: 'Russell 2000 Futures', short: 'RTY' },
};

const YIELD_META: Record<string, { name: string; short: string }> = {
  '^TNX': { name: '10-Year Treasury', short: '10Y' },
  '^TYX': { name: '30-Year Treasury', short: '30Y' },
};

const FUTURES_ORDER = ['ES=F', 'YM=F', 'NQ=F', 'RTY=F'];
const YIELD_ORDER   = ['^TNX', '^TYX'];

function fmt(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function FutureRow({ q }: { q: QuoteData }) {
  const meta = FUTURES_META[q.symbol];
  const up = q.changePercent >= 0;
  const color = up ? 'var(--color-green)' : 'var(--color-red)';
  return (
    <div className="global-table-row">
      <div className="global-row-name">
        <span className="global-row-label">{meta?.name ?? q.symbol}</span>
        <span className="global-row-sub">{meta?.short ?? q.symbol}</span>
      </div>
      <span className="global-row-price ta-right">
        <AnimatedNumber value={q.price} format={fmt} />
      </span>
      <span className="global-row-change ta-right" style={{ color }}>
        {up ? '+' : ''}{q.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

function YieldRow({ q }: { q: QuoteData }) {
  const meta = YIELD_META[q.symbol];
  // For yields, change field = change in yield (e.g. +0.05 = +5 bps)
  const bps = Math.round(q.change * 100);
  const up = q.change >= 0;
  const color = up ? 'var(--color-red)' : 'var(--color-green)'; // rising yields = bearish for bonds
  return (
    <div className="global-table-row">
      <div className="global-row-name">
        <span className="global-row-label">{meta?.name ?? q.symbol}</span>
        <span className="global-row-sub">{meta?.short ?? q.symbol}</span>
      </div>
      <span className="global-row-price ta-right">
        <AnimatedNumber value={q.price} decimals={3} suffix="%" />
      </span>
      <span className="global-row-change ta-right" style={{ color }}>
        {up ? '+' : ''}{bps} bps
      </span>
    </div>
  );
}

export default function FuturesPanel({ quotes, loading }: Props) {
  const bySymbol = Object.fromEntries(quotes.map(q => [q.symbol, q]));
  const futures = FUTURES_ORDER.map(s => bySymbol[s]).filter(Boolean);
  const yields  = YIELD_ORDER.map(s => bySymbol[s]).filter(Boolean);

  return (
    <div className="global-panel">
      <div className="global-panel-header">
        <span className="global-panel-title">Futures &amp; Yields</span>
        <span className="global-panel-subtitle">US Markets</span>
      </div>

      {loading && quotes.length === 0 ? (
        <LoadingState rows={6} height={18} />
      ) : (
        <div className="global-table">
          <div className="global-table-head">
            <span>Contract</span>
            <span className="ta-right">Price</span>
            <span className="ta-right">Change</span>
          </div>

          <div className="global-region-label">Equity Futures</div>
          {futures.map(q => <FutureRow key={q.symbol} q={q} />)}

          <div className="global-region-label global-region-label--gap">Treasury Yields</div>
          {yields.map(q => <YieldRow key={q.symbol} q={q} />)}
        </div>
      )}
    </div>
  );
}
