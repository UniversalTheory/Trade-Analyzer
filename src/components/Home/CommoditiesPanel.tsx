import type { QuoteData } from '../../api/types';
import LoadingState from '../common/LoadingState';
import { AnimatedNumber } from '../AnimatedNumber';

interface Props {
  quotes: QuoteData[];
  loading: boolean;
}

interface CommodityMeta {
  name: string;
  unit: string;
  group: 'energy' | 'metals' | 'digital';
}

const COMMODITY_META: Record<string, CommodityMeta> = {
  'CL=F':   { name: 'WTI Crude',   unit: '/bbl', group: 'energy'  },
  'BZ=F':   { name: 'Brent Crude', unit: '/bbl', group: 'energy'  },
  'GC=F':   { name: 'Gold',        unit: '/oz',  group: 'metals'  },
  'SI=F':   { name: 'Silver',      unit: '/oz',  group: 'metals'  },
  'HG=F':   { name: 'Copper',      unit: '/lb',  group: 'metals'  },
  'BTC-USD': { name: 'Bitcoin',    unit: 'USD',  group: 'digital' },
};

function fmt(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CommoditiesPanel({ quotes, loading }: Props) {
  const energy  = quotes.filter(q => COMMODITY_META[q.symbol]?.group === 'energy');
  const metals  = quotes.filter(q => COMMODITY_META[q.symbol]?.group === 'metals');
  const digital = quotes.filter(q => COMMODITY_META[q.symbol]?.group === 'digital');

  return (
    <div className="global-panel">
      <div className="global-panel-header">
        <span className="global-panel-title">Commodities</span>
        <span className="global-panel-subtitle">Spot &amp; Futures</span>
      </div>

      {loading && quotes.length === 0 ? (
        <LoadingState rows={5} height={18} />
      ) : (
        <div className="global-table">
          <div className="global-table-head">
            <span>Commodity</span>
            <span className="ta-right">Price</span>
            <span className="ta-right">Chg%</span>
          </div>

          <div className="global-region-label">Energy</div>
          {energy.map(q => {
            const meta = COMMODITY_META[q.symbol];
            const up = q.changePercent >= 0;
            const color = up ? 'var(--color-green)' : 'var(--color-red)';
            return (
              <div key={q.symbol} className="global-table-row">
                <div className="global-row-name">
                  <span className="global-row-label">{meta?.name ?? q.symbol}</span>
                  <span className="global-row-sub">{q.symbol} · {meta?.unit}</span>
                </div>
                <span className="global-row-price ta-right">
                  <AnimatedNumber value={q.price} format={fmt} prefix="$" />
                </span>
                <span className="global-row-change ta-right" style={{ color }}>
                  {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                </span>
              </div>
            );
          })}

          <div className="global-region-label global-region-label--gap">Metals</div>
          {metals.map(q => {
            const meta = COMMODITY_META[q.symbol];
            const up = q.changePercent >= 0;
            const color = up ? 'var(--color-green)' : 'var(--color-red)';
            return (
              <div key={q.symbol} className="global-table-row">
                <div className="global-row-name">
                  <span className="global-row-label">{meta?.name ?? q.symbol}</span>
                  <span className="global-row-sub">{q.symbol} · {meta?.unit}</span>
                </div>
                <span className="global-row-price ta-right">
                  <AnimatedNumber value={q.price} format={fmt} prefix="$" />
                </span>
                <span className="global-row-change ta-right" style={{ color }}>
                  {up ? '+' : ''}{q.changePercent.toFixed(2)}%
                </span>
              </div>
            );
          })}

          <div className="global-region-label global-region-label--gap">Digital Assets</div>
          {digital.map(q => {
            const meta = COMMODITY_META[q.symbol];
            const up = q.changePercent >= 0;
            const color = up ? 'var(--color-green)' : 'var(--color-red)';
            return (
              <div key={q.symbol} className="global-table-row">
                <div className="global-row-name">
                  <span className="global-row-label">{meta?.name ?? q.symbol}</span>
                  <span className="global-row-sub">{q.symbol} · {meta?.unit}</span>
                </div>
                <span className="global-row-price ta-right">
                  <AnimatedNumber value={q.price} format={fmt} prefix="$" />
                </span>
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
