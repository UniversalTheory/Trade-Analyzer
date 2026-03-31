import type { SectorScore } from '../../utils/sectorAnalysis';

interface Props {
  score: SectorScore;
  sectorName: string;
}

function ScoreGauge({ value, label, type }: { value: number; label: string; type: 'opportunity' | 'risk' }) {
  const isOpp  = type === 'opportunity';
  const color  =
    isOpp
      ? (value >= 7 ? 'var(--color-green)' : value >= 4 ? 'var(--color-yellow)' : 'var(--color-red)')
      : (value >= 7 ? 'var(--color-red)'   : value >= 4 ? 'var(--color-yellow)' : 'var(--color-green)');

  const pct = ((value - 1) / 9) * 100;

  return (
    <div className="gauge-block">
      <div className="gauge-header">
        <span className="gauge-label">{label}</span>
        <span className="gauge-score" style={{ color }}>{value.toFixed(1)}<span className="gauge-max">/10</span></span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="gauge-ticks">
        {[1, 3, 5, 7, 9].map(t => (
          <span key={t} className="gauge-tick">{t}</span>
        ))}
      </div>
    </div>
  );
}

function verdictFromScores(opp: number, risk: number): { label: string; color: string; desc: string } {
  const net = opp - risk;
  if (opp >= 7 && risk <= 4) return { label: 'Strong Buy Setup', color: 'var(--color-green)', desc: 'High opportunity with controlled risk. Favorable conditions for bullish positions.' };
  if (opp >= 6 && risk <= 5) return { label: 'Favorable',        color: 'var(--color-green)', desc: 'More opportunity than risk. Sector momentum supports bullish bias.' };
  if (net >= 1)              return { label: 'Slight Edge',       color: 'var(--color-blue)',  desc: 'Modest opportunity edge. Monitor for confirmation before committing.' };
  if (Math.abs(net) < 1)    return { label: 'Neutral',           color: 'var(--color-blue)',  desc: 'Balanced conditions. No clear directional edge at this time.' };
  if (risk >= 7 && opp <= 4) return { label: 'High Risk',        color: 'var(--color-red)',   desc: 'Risk outweighs opportunity significantly. Defensive positioning advised.' };
  return { label: 'Caution',           color: 'var(--color-yellow)', desc: 'Risk elevated relative to opportunity. Reduce size or await clearer signals.' };
}

export default function RiskOpportunityGauge({ score, sectorName }: Props) {
  const verdict = verdictFromScores(score.opportunityScore, score.riskScore);

  return (
    <div className="gauge-panel">
      <div className="section-heading">Risk / Opportunity Rating</div>

      <ScoreGauge value={score.opportunityScore} label="Opportunity" type="opportunity" />
      <ScoreGauge value={score.riskScore}        label="Risk"        type="risk" />

      <div className="gauge-verdict" style={{ borderColor: verdict.color }}>
        <div className="gauge-verdict-label" style={{ color: verdict.color }}>
          {verdict.label}
        </div>
        <div className="gauge-verdict-desc">{verdict.desc}</div>
        <div className="gauge-verdict-sector">for {sectorName}</div>
      </div>
    </div>
  );
}
