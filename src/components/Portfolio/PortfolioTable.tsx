import { AnimatedNumber } from '../AnimatedNumber';
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
}

export default function PortfolioTable({ positions, quotes, onRemove }: Props) {
  if (positions.length === 0) {
    return (
      <div className="portfolio-empty">
        No positions yet — add a ticker above to get started.
      </div>
    );
  }

  return (
    <div className="global-table portfolio-table">
      <div className="portfolio-table-head">
        <span>Ticker</span>
        <span className="ta-right">Shares</span>
        <span className="ta-right">Purchase $</span>
        <span className="ta-right">Current $</span>
        <span className="ta-right">P/L $</span>
        <span className="ta-right">P/L %</span>
        <span />
      </div>

      {positions.map(p => {
        const quote = quotes[p.symbol];
        const currentPrice = quote?.price;
        const metrics = computePositionMetrics(p, currentPrice);
        const plColor = !metrics
          ? 'var(--text-muted)'
          : metrics.pl >= 0 ? 'var(--color-green)' : 'var(--color-red)';

        return (
          <div key={p.id} className="portfolio-table-row">
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

            <span className="global-row-change ta-right" style={{ color: plColor }}>
              {metrics
                ? `${signed(metrics.pl)}$${fmtUSD(Math.abs(metrics.pl))}`
                : '—'}
            </span>

            <span className="global-row-change ta-right" style={{ color: plColor }}>
              {metrics ? `${signed(metrics.pl)}${fmtPct(metrics.plPct)}` : '—'}
            </span>

            <button
              className="portfolio-remove-btn"
              onClick={() => onRemove(p.id)}
              title="Remove position"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
