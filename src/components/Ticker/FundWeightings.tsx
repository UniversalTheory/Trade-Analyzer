import type { FundSectorWeight } from '../../api/types';

interface Props {
  sectors: FundSectorWeight[];
}

export default function FundWeightings({ sectors }: Props) {
  if (!sectors.length) return null;

  const sorted = [...sectors].sort((a, b) => b.weight - a.weight);
  const maxWeight = sorted[0]?.weight ?? 0;

  return (
    <div className="fund-weightings-card">
      <div className="fund-bar-card-head">
        <span className="fund-bar-card-heading">Sector Weightings</span>
      </div>

      <div className="fund-bar-list">
        {sorted.map(s => (
          <div key={s.sector} className="fund-bar-row">
            <div className="fund-bar-head">
              <span className="fund-bar-label">{s.sector}</span>
              <span className="fund-bar-value">{(s.weight * 100).toFixed(1)}%</span>
            </div>
            <div className="fund-bar-track">
              <div
                className="fund-bar-fill"
                style={{ width: maxWeight > 0 ? `${(s.weight / maxWeight) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="fund-weightings-note">
        Sector mix derived from fund holdings. Geographic breakdown isn’t available from the data provider.
      </div>
    </div>
  );
}
