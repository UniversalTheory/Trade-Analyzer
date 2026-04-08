import type { EarningsData, EarningsQuarter } from '../../api/types';

interface Props {
  data: EarningsData;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtRevenue(val: number): string {
  if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (Math.abs(val) >= 1e9)  return `$${(val / 1e9).toFixed(2)}B`;
  if (Math.abs(val) >= 1e6)  return `$${(val / 1e6).toFixed(1)}M`;
  return `$${val.toFixed(0)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── EPS Bar Chart ─────────────────────────────────────────────────────────────

function EpsChart({ quarters }: { quarters: EarningsQuarter[] }) {
  const W = 400;
  const H = 80;
  const ML = 6; const MR = 6; const MT = 14; const MB = 4;
  const chartW = W - ML - MR;
  const chartH = H - MT - MB;

  const n = quarters.length;
  if (n === 0) return null;

  const barW  = Math.max(Math.floor((chartW / n) * 0.55), 8);
  const step  = chartW / n;

  const allVals = quarters.flatMap(q => [q.epsActual ?? 0, q.epsEstimate ?? 0]);
  const maxAbs  = Math.max(...allVals.map(Math.abs), 0.01);
  const hasNeg  = allVals.some(v => v < 0);

  // Zero line: if no negatives, sits at bottom; otherwise at 65%
  const zeroFrac = hasNeg ? 0.65 : 1.0;
  const zeroY    = chartH * zeroFrac;

  const toY = (v: number) =>
    zeroY - (v / maxAbs) * (hasNeg ? Math.min(zeroY, chartH - zeroY) * 0.9 : chartH * 0.88);

  const GREEN = '#22c55e';
  const RED   = '#ef4444';

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="earnings-svg">
      <g transform={`translate(${ML},${MT})`}>
        {/* Zero line */}
        <line x1={0} y1={zeroY} x2={chartW} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

        {quarters.map((q, i) => {
          const cx   = step * i + step / 2;
          const x    = cx - barW / 2;
          const beat = q.epsEstimate == null || (q.epsActual ?? 0) >= q.epsEstimate;
          const color = beat ? GREEN : RED;

          const actualY = toY(q.epsActual ?? 0);
          const barTop  = Math.min(actualY, zeroY);
          const barH    = Math.max(Math.abs(actualY - zeroY), 1.5);

          const estY = q.epsEstimate != null ? toY(q.epsEstimate) : null;

          // Surprise label: place above the topmost point of bar + estimate
          const topY = estY != null ? Math.min(actualY, estY) : actualY;

          return (
            <g key={i}>
              {/* Bar */}
              <rect x={x} y={barTop} width={barW} height={barH} fill={color} fillOpacity={0.85} rx={2} />

              {/* Estimate tick */}
              {estY != null && (
                <line
                  x1={x - 3} y1={estY} x2={x + barW + 3} y2={estY}
                  stroke="rgba(255,255,255,0.55)" strokeWidth={1.5}
                />
              )}

              {/* Surprise % */}
              {q.epsSurprisePct != null && (
                <text
                  x={cx} y={topY - 4}
                  textAnchor="middle" fontSize={7.5}
                  fill={beat ? GREEN : RED} fontWeight="600"
                >
                  {q.epsSurprisePct > 0 ? '+' : ''}{q.epsSurprisePct.toFixed(1)}%
                </text>
              )}

            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ── Shared X-Axis Label Row ────────────────────────────────────────────────────

function XAxisLabels({ quarters }: { quarters: EarningsQuarter[] }) {
  if (quarters.length === 0) return null;
  return (
    <div className="earnings-x-axis">
      {quarters.map((q, i) => (
        <div key={i} className="earnings-x-label">{q.period}</div>
      ))}
    </div>
  );
}

// ── Revenue Bar Chart ─────────────────────────────────────────────────────────

function RevenueChart({ quarters }: { quarters: EarningsQuarter[] }) {
  const withRev = quarters.filter(q => q.revenueActual != null);
  if (withRev.length === 0) return null;

  const W = 400;
  const H = 65;
  const ML = 6; const MR = 6; const MT = 12; const MB = 4;
  const chartW = W - ML - MR;
  const chartH = H - MT - MB;

  const n     = withRev.length;
  const barW  = Math.max(Math.floor((chartW / n) * 0.55), 8);
  const step  = chartW / n;
  const maxRev = Math.max(...withRev.map(q => q.revenueActual!));

  // Color by YoY if we have 5+ quarters, otherwise QoQ
  const useYoY = withRev.length >= 5;
  const NEUTRAL = '#4b5563'; // no prior period to compare against
  const GREEN   = '#22c55e';
  const RED     = '#ef4444';

  const getColor = (i: number): string => {
    const compare = useYoY ? withRev[i - 4] : withRev[i - 1];
    if (!compare) return NEUTRAL;
    const prev = compare.revenueActual!;
    const curr = withRev[i].revenueActual!;
    if (curr > prev * 1.005) return GREEN;
    if (curr < prev * 0.995) return RED;
    return NEUTRAL;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="earnings-svg">
      <g transform={`translate(${ML},${MT})`}>
        {/* Baseline */}
        <line x1={0} y1={chartH} x2={chartW} y2={chartH} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

        {withRev.map((q, i) => {
          const cx    = step * i + step / 2;
          const x     = cx - barW / 2;
          const barH  = Math.max((q.revenueActual! / maxRev) * chartH * 0.88, 1.5);
          const barY  = chartH - barH;
          const color = getColor(i);

          return (
            <g key={i}>
              <rect x={x} y={barY} width={barW} height={barH} fill={color} fillOpacity={0.85} rx={2} />

              {/* Revenue label above bar */}
              <text
                x={cx} y={barY - 4}
                textAnchor="middle" fontSize={7}
                fill="rgba(255,255,255,0.45)"
              >
                {fmtRevenue(q.revenueActual!)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ── Main Card ─────────────────────────────────────────────────────────────────

export default function EarningsCard({ data }: Props) {
  const { quarters, nextEarningsDate, nextEarningsDateEnd } = data;

  const hasRevenue = quarters.some(q => q.revenueActual != null);

  const nextDateStr = nextEarningsDate
    ? nextEarningsDateEnd && nextEarningsDateEnd !== nextEarningsDate
      ? `${fmtDate(nextEarningsDate)} – ${fmtDate(nextEarningsDateEnd)}`
      : fmtDate(nextEarningsDate)
    : null;

  // Days until next earnings
  let daysUntil: number | null = null;
  if (nextEarningsDate) {
    const diff = new Date(nextEarningsDate + 'T00:00:00').getTime() - Date.now();
    daysUntil = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="earnings-card">
      <div className="earnings-header">
        <div className="earnings-title">Earnings History</div>
        {nextDateStr && (
          <div className="earnings-next-date">
            <span className="earnings-next-label">Next Report</span>
            <span className="earnings-next-val">{nextDateStr}</span>
            {daysUntil != null && daysUntil >= 0 && (
              <span className="earnings-next-countdown">
                {daysUntil === 0 ? 'Today' : `${daysUntil}d away`}
              </span>
            )}
          </div>
        )}
      </div>

      {quarters.length === 0 ? (
        <div className="earnings-empty">No earnings history available for this symbol.</div>
      ) : (
        <>
          {/* EPS Section */}
          <div className="earnings-section-label">
            EPS
            <span className="earnings-legend">
              <span className="earnings-legend-bar earnings-legend-bar--beat" /> Beat
              <span className="earnings-legend-bar earnings-legend-bar--miss" /> Miss
              <span className="earnings-legend-tick" /> Estimate
            </span>
          </div>
          <EpsChart quarters={quarters} />
          <XAxisLabels quarters={quarters} />

          {/* Revenue Section */}
          {hasRevenue && (
            <>
              <div className="earnings-section-label earnings-section-label--rev">
                Revenue
                <span className="earnings-legend">
                  <span className="earnings-legend-bar earnings-legend-bar--beat" /> Growth
                  <span className="earnings-legend-bar earnings-legend-bar--miss" /> Decline
                  <span className="earnings-legend-bar earnings-legend-bar--neutral" /> No prior data
                </span>
              </div>
              <RevenueChart quarters={quarters} />
              <XAxisLabels quarters={quarters.filter(q => q.revenueActual != null)} />
            </>
          )}
        </>
      )}
    </div>
  );
}
