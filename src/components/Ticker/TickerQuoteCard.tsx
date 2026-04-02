import type { QuoteData } from '../../api/types';

interface Props {
  quote: QuoteData;
}

function fmt(n: number | undefined, prefix = '', decimals = 2): string {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return `${prefix}${n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtLarge(n: number | undefined): string {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

function fmtVol(n: number | undefined): string {
  if (!n) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toString();
}

export default function TickerQuoteCard({ quote }: Props) {
  const up = quote.changePercent >= 0;

  return (
    <div className="ticker-quote-card">
      <div className="ticker-quote-header">
        <div>
          <div className="ticker-quote-symbol">{quote.symbol}</div>
          <div className="ticker-quote-name">{quote.name}</div>
        </div>
        <div className="ticker-quote-price-block">
          <div className="ticker-quote-price">{fmt(quote.price, '$')}</div>
          <div className={`ticker-quote-change ${up ? 'up' : 'down'}`}>
            {up ? '+' : ''}{fmt(quote.change, '$')} ({up ? '+' : ''}{fmt(quote.changePercent, '', 2)}%)
          </div>
        </div>
      </div>

      <div className="ticker-quote-stats">
        <div className="ticker-quote-stat">
          <span className="tqs-label">Open</span>
          <span className="tqs-value">{fmt(quote.open, '$')}</span>
        </div>
        <div className="ticker-quote-stat">
          <span className="tqs-label">High</span>
          <span className="tqs-value text-green">{fmt(quote.high, '$')}</span>
        </div>
        <div className="ticker-quote-stat">
          <span className="tqs-label">Low</span>
          <span className="tqs-value text-red">{fmt(quote.low, '$')}</span>
        </div>
        <div className="ticker-quote-stat">
          <span className="tqs-label">Prev Close</span>
          <span className="tqs-value">{fmt(quote.previousClose, '$')}</span>
        </div>
        <div className="ticker-quote-stat">
          <span className="tqs-label">Volume</span>
          <span className="tqs-value">{fmtVol(quote.volume)}</span>
        </div>
        <div className="ticker-quote-stat">
          <span className="tqs-label">Avg Vol</span>
          <span className="tqs-value">{fmtVol(quote.avgVolume)}</span>
        </div>
        <div className="ticker-quote-stat">
          <span className="tqs-label">Mkt Cap</span>
          <span className="tqs-value">{fmtLarge(quote.marketCap)}</span>
        </div>
        <div className="ticker-quote-stat">
          <span className="tqs-label">P/E</span>
          <span className="tqs-value">{fmt(quote.pe, '', 1)}</span>
        </div>
        <div className="ticker-quote-stat">
          <span className="tqs-label">52W High</span>
          <span className="tqs-value">{fmt(quote.week52High, '$')}</span>
        </div>
        <div className="ticker-quote-stat">
          <span className="tqs-label">52W Low</span>
          <span className="tqs-value">{fmt(quote.week52Low, '$')}</span>
        </div>
      </div>
    </div>
  );
}
