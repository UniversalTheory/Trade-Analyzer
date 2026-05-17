import { useMemo } from 'react';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import { computeConcentration, type HhiBand } from '../../utils/portfolioAnalysis';
import { fmtPct } from '../../utils/portfolioCalc';

interface Props {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
}

const BAND_COLOR: Record<HhiBand, string> = {
  Diversified:  'var(--color-green)',
  Moderate:     'var(--color-yellow)',
  Concentrated: 'var(--color-red)',
};

export default function ConcentrationSection({ positions, priceBySymbol }: Props) {
  const m = useMemo(
    () => computeConcentration(positions, priceBySymbol),
    [positions, priceBySymbol],
  );

  if (m.count === 0) {
    return (
      <div className="analysis-section">
        <div className="analysis-section-header">
          <h4 className="analysis-section-title">Concentration</h4>
        </div>
        <div className="analysis-empty">Add positions to see concentration metrics</div>
      </div>
    );
  }

  return (
    <div className="analysis-section">
      <div className="analysis-section-header">
        <h4 className="analysis-section-title">Concentration</h4>
        <span
          className="concentration-band-pill"
          style={{ color: BAND_COLOR[m.hhiBand], borderColor: BAND_COLOR[m.hhiBand] }}
        >
          {m.hhiBand}
        </span>
      </div>

      <div className="concentration-grid">
        <div className="concentration-stat">
          <div className="concentration-stat-label">Positions</div>
          <div className="concentration-stat-value">{m.count}</div>
        </div>
        <div className="concentration-stat">
          <div className="concentration-stat-label">Largest</div>
          <div className="concentration-stat-value">{fmtPct(m.largestPct)}</div>
        </div>
        <div className="concentration-stat">
          <div className="concentration-stat-label">Top 3 weight</div>
          <div className="concentration-stat-value">{fmtPct(m.top3Pct)}</div>
        </div>
        <div className="concentration-stat" title="Herfindahl–Hirschman Index. <0.15 diversified, 0.15–0.25 moderate, >0.25 concentrated.">
          <div className="concentration-stat-label">HHI</div>
          <div className="concentration-stat-value">{m.hhi.toFixed(3)}</div>
        </div>
      </div>
    </div>
  );
}
