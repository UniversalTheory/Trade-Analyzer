import type { FundHolding } from '../../api/types';

interface Props {
  holdings: FundHolding[];
}

export default function FundHoldings({ holdings }: Props) {
  if (!holdings.length) return null;

  const topSum = holdings.reduce((acc, h) => acc + h.weight, 0);
  const maxWeight = Math.max(...holdings.map(h => h.weight), 0);

  return (
    <div className="fund-holdings-card">
      <div className="fund-bar-card-head">
        <span className="fund-bar-card-heading">Top Holdings</span>
        <span className="fund-bar-card-sub">
          Top {holdings.length} · {(topSum * 100).toFixed(1)}% of fund
        </span>
      </div>

      <div className="fund-bar-list">
        {holdings.map(h => (
          <div key={h.symbol || h.name} className="fund-bar-row">
            <div className="fund-bar-head">
              <span className="fund-bar-label">{h.symbol || '—'}</span>
              <span className="fund-bar-name">{h.name}</span>
              <span className="fund-bar-value">{(h.weight * 100).toFixed(2)}%</span>
            </div>
            <div className="fund-bar-track">
              <div
                className="fund-bar-fill"
                style={{ width: maxWeight > 0 ? `${(h.weight / maxWeight) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
