import { useMemo } from 'react';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import { computeConcentration, type HhiBand } from '../../utils/portfolioAnalysis';
import { fmtPct } from '../../utils/portfolioCalc';

interface Props {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
  onShowInResearch?: (symbol: string) => void;
}

const BAND_COLOR: Record<HhiBand, string> = {
  Diversified:  'var(--color-green)',
  Moderate:     'var(--color-yellow)',
  Concentrated: 'var(--color-red)',
};

export default function ConcentrationSection({ positions, priceBySymbol, onShowInResearch }: Props) {
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
          <div className="concentration-stat-value">
            {fmtPct(m.largestPct)}
            {m.largestSymbol && (
              <span className="concentration-stat-meta">
                {' ('}
                {onShowInResearch ? (
                  <button
                    type="button"
                    className="concentration-ticker-link"
                    onClick={() => onShowInResearch(m.largestSymbol!)}
                    title={`Open ${m.largestSymbol} in Research`}
                  >
                    {m.largestSymbol}
                  </button>
                ) : m.largestSymbol}
                {')'}
              </span>
            )}
          </div>
        </div>
        <div className="concentration-stat">
          <div className="concentration-stat-label">Top 3 weight</div>
          <div className="concentration-stat-value">
            {fmtPct(m.top3Pct)}
            {m.top3Symbols.length > 0 && (
              <span className="concentration-stat-meta">
                {' ('}
                {m.top3Symbols.map((sym, i) => (
                  <span key={sym}>
                    {i > 0 && ', '}
                    {onShowInResearch ? (
                      <button
                        type="button"
                        className="concentration-ticker-link"
                        onClick={() => onShowInResearch(sym)}
                        title={`Open ${sym} in Research`}
                      >
                        {sym}
                      </button>
                    ) : sym}
                  </span>
                ))}
                {')'}
              </span>
            )}
          </div>
        </div>
        <div className="concentration-stat" title="Herfindahl–Hirschman Index. <0.15 diversified, 0.15–0.25 moderate, >0.25 concentrated.">
          <div className="concentration-stat-label">HHI</div>
          <div className="concentration-stat-value">{m.hhi.toFixed(3)}</div>
        </div>
      </div>
    </div>
  );
}
