import type { QuoteData, SectorPerformance } from '../../api/types';

interface Props {
  vix: QuoteData | null;
  sectors: SectorPerformance[];
  indices: QuoteData[];
}

function vixInterpretation(price: number): { label: string; desc: string; color: string } {
  if (price < 15) return {
    label: 'Low Volatility',
    desc: 'Markets are calm. Options premiums are cheap — good time to buy protection.',
    color: 'var(--color-green)',
  };
  if (price < 20) return {
    label: 'Normal Range',
    desc: 'Typical market conditions. Balanced conditions for both buyers and sellers.',
    color: 'var(--color-blue)',
  };
  if (price < 30) return {
    label: 'Elevated Fear',
    desc: 'Above-average uncertainty. Options premiums are elevated — credit spreads may offer edge.',
    color: 'var(--color-yellow)',
  };
  return {
    label: 'High Fear / Crisis',
    desc: 'Extreme volatility. Markets are stressed. Exercise caution with leveraged positions.',
    color: 'var(--color-red)',
  };
}

function marketSentiment(indices: QuoteData[]): { label: string; color: string; desc: string } {
  const spy = indices.find(q => q.symbol === 'SPY');
  if (!spy) return { label: 'Unknown', color: 'var(--text-muted)', desc: '' };
  const pct = spy.changePercent;
  if (pct > 1.5)  return { label: 'Strong Bullish', color: 'var(--color-green)', desc: `SPY up ${pct.toFixed(2)}% — broad market strength` };
  if (pct > 0.25) return { label: 'Mildly Bullish', color: 'var(--color-green)', desc: `SPY up ${pct.toFixed(2)}% — moderate buying pressure` };
  if (pct > -0.25) return { label: 'Neutral / Flat', color: 'var(--color-blue)', desc: `SPY ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% — consolidation` };
  if (pct > -1.5)  return { label: 'Mildly Bearish', color: 'var(--color-yellow)', desc: `SPY down ${Math.abs(pct).toFixed(2)}% — moderate selling` };
  return { label: 'Strong Bearish', color: 'var(--color-red)', desc: `SPY down ${Math.abs(pct).toFixed(2)}% — broad market weakness` };
}

function topSectors(sectors: SectorPerformance[]): { best: SectorPerformance | null; worst: SectorPerformance | null } {
  if (!sectors.length) return { best: null, worst: null };
  const sorted = [...sectors].sort((a, b) => b.changePercent1D - a.changePercent1D);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

export default function MacroIndicators({ vix, sectors, indices }: Props) {
  const vixData = vix ? vixInterpretation(vix.price) : null;
  const sentiment = marketSentiment(indices);
  const { best, worst } = topSectors(sectors);

  return (
    <div className="macro-panel">
      <div className="section-heading">Market Conditions</div>

      <div className="macro-grid">

        {/* VIX */}
        <div className="macro-card">
          <div className="macro-card-label">VIX Volatility Index</div>
          {vix ? (
            <>
              <div className="macro-card-value" style={{ color: vixData?.color }}>
                {vix.price.toFixed(2)}
              </div>
              <div className="macro-card-badge" style={{ color: vixData?.color, borderColor: vixData?.color }}>
                {vixData?.label}
              </div>
              <div className="macro-card-desc">{vixData?.desc}</div>
              <div className="macro-vix-bar">
                <div
                  className="macro-vix-fill"
                  style={{
                    width: `${Math.min((vix.price / 50) * 100, 100)}%`,
                    background: `linear-gradient(90deg, var(--color-green), var(--color-yellow) 50%, var(--color-red))`,
                    clipPath: `inset(0 ${100 - Math.min((vix.price / 50) * 100, 100)}% 0 0)`,
                  }}
                />
              </div>
              <div className="macro-vix-scale">
                <span>0</span><span>15</span><span>25</span><span>40+</span>
              </div>
            </>
          ) : (
            <div className="macro-card-na">Unavailable</div>
          )}
        </div>

        {/* Market Sentiment */}
        <div className="macro-card">
          <div className="macro-card-label">Today's Market Tone</div>
          <div className="macro-card-badge large" style={{ color: sentiment.color, borderColor: sentiment.color }}>
            {sentiment.label}
          </div>
          <div className="macro-card-desc" style={{ marginTop: 8 }}>{sentiment.desc}</div>
          <div className="macro-breadth-row">
            {indices.filter(q => q.symbol !== '^VIX').map(q => (
              <div key={q.symbol} className="macro-index-mini">
                <span className="macro-index-sym">{q.symbol}</span>
                <span style={{ color: q.changePercent >= 0 ? 'var(--color-green)' : 'var(--color-red)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                  {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sector Leaders */}
        <div className="macro-card">
          <div className="macro-card-label">Sector Leaders Today</div>
          {best && (
            <div className="macro-sector-row">
              <span className="macro-sector-tag best">▲ Best</span>
              <span className="macro-sector-name">{best.sector}</span>
              <span className="macro-sector-pct" style={{ color: 'var(--color-green)' }}>
                +{best.changePercent1D.toFixed(2)}%
              </span>
            </div>
          )}
          {worst && (
            <div className="macro-sector-row" style={{ marginTop: 10 }}>
              <span className="macro-sector-tag worst">▼ Worst</span>
              <span className="macro-sector-name">{worst.sector}</span>
              <span className="macro-sector-pct" style={{ color: 'var(--color-red)' }}>
                {worst.changePercent1D.toFixed(2)}%
              </span>
            </div>
          )}
          {sectors.length > 0 && (
            <div className="macro-sector-mini-bars">
              {[...sectors]
                .sort((a, b) => b.changePercent1D - a.changePercent1D)
                .map(s => (
                  <div key={s.sector} className="macro-mini-bar-row">
                    <span className="macro-mini-bar-label">{s.etfSymbol}</span>
                    <div className="macro-mini-bar-track">
                      <div
                        className="macro-mini-bar-fill"
                        style={{
                          width: `${Math.min(Math.abs(s.changePercent1D) * 20, 100)}%`,
                          background: s.changePercent1D >= 0 ? 'var(--color-green)' : 'var(--color-red)',
                        }}
                      />
                    </div>
                    <span
                      className="macro-mini-bar-pct"
                      style={{ color: s.changePercent1D >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}
                    >
                      {s.changePercent1D >= 0 ? '+' : ''}{s.changePercent1D.toFixed(2)}%
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
