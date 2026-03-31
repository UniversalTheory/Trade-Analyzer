import type { SectorScore } from '../../utils/sectorAnalysis';

interface Props {
  score: SectorScore;
}

const TREND_META = {
  bullish: { label: 'Bullish Trend', color: 'var(--color-green)', icon: '▲' },
  bearish: { label: 'Bearish Trend', color: 'var(--color-red)',   icon: '▼' },
  neutral: { label: 'Neutral',       color: 'var(--color-blue)',  icon: '—' },
};

const MOMENTUM_META = {
  strong:   { label: 'Strong',   color: 'var(--color-green)' },
  moderate: { label: 'Moderate', color: 'var(--color-yellow)' },
  weak:     { label: 'Weak',     color: 'var(--color-red)' },
};

function MomentumRow({ label, value, color, detail }: {
  label: string; value: string; color: string; detail?: string;
}) {
  return (
    <div className="momentum-row">
      <span className="momentum-label">{label}</span>
      <div className="momentum-right">
        {detail && <span className="momentum-detail">{detail}</span>}
        <span className="momentum-value" style={{ color }}>{value}</span>
      </div>
    </div>
  );
}

export default function SectorMomentum({ score }: Props) {
  const trend    = TREND_META[score.trendDirection];
  const momentum = MOMENTUM_META[score.momentumStrength];

  return (
    <div className="momentum-panel">
      <div className="section-heading">Technical Momentum</div>

      {/* Trend + Momentum badges */}
      <div className="momentum-badges">
        <div className="momentum-badge" style={{ color: trend.color, borderColor: trend.color }}>
          {trend.icon} {trend.label}
        </div>
        <div className="momentum-badge" style={{ color: momentum.color, borderColor: momentum.color }}>
          {momentum.label} Momentum
        </div>
      </div>

      {/* Metric rows */}
      <div className="momentum-metrics">
        {score.rsi !== null && (
          <MomentumRow
            label="RSI (14)"
            value={score.rsi.toFixed(1)}
            color={score.rsi < 30 ? 'var(--color-green)' : score.rsi > 70 ? 'var(--color-red)' : 'var(--color-blue)'}
            detail={score.rsi < 30 ? 'Oversold' : score.rsi > 70 ? 'Overbought' : 'Neutral'}
          />
        )}
        {score.sma20 !== null && (
          <MomentumRow
            label="20-Day MA"
            value={`$${score.sma20.toFixed(2)}`}
            color="var(--text-secondary)"
          />
        )}
        {score.sma50 !== null && (
          <MomentumRow
            label="50-Day MA"
            value={`$${score.sma50.toFixed(2)}`}
            color="var(--text-secondary)"
          />
        )}
        {score.relativeStrength !== null && (
          <MomentumRow
            label="vs SPY (3M)"
            value={`${score.relativeStrength >= 0 ? '+' : ''}${score.relativeStrength.toFixed(1)}pp`}
            color={score.relativeStrength > 0 ? 'var(--color-green)' : 'var(--color-red)'}
            detail={score.relativeStrength > 0 ? 'Outperforming' : 'Underperforming'}
          />
        )}
      </div>

      {/* Score factors */}
      {score.factors.length > 0 && (
        <>
          <div className="factors-heading">Score Factors</div>
          <div className="factors-list">
            {score.factors.map((f, i) => (
              <div key={i} className={`factor-item factor-${f.contribution}`}>
                <span className="factor-icon">
                  {f.contribution === 'positive' ? '▲' : f.contribution === 'negative' ? '▼' : '—'}
                </span>
                <div className="factor-body">
                  <span className="factor-label">{f.label}</span>
                  <span className="factor-detail">{f.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
