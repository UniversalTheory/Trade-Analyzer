import type { QuoteData, SectorPerformance, NewsItem, EconomicEvent } from '../../api/types';
import MarketNews from './MarketNews';
import EconomicCalendar from './EconomicCalendar';

interface Props {
  vix: QuoteData | null;
  sectors: SectorPerformance[];
  indices: QuoteData[];
  news: NewsItem[];
  events: EconomicEvent[];
  calendarUnavailable?: boolean;
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
  const spx = indices.find(q => q.symbol === '^GSPC');
  if (!spx) return { label: 'Unknown', color: 'var(--text-muted)', desc: '' };
  const pct = spx.changePercent;
  if (pct > 1.5)  return { label: 'Strong Bullish', color: 'var(--color-green)', desc: `S&P 500 up ${pct.toFixed(2)}% — broad market strength` };
  if (pct > 0.25) return { label: 'Mildly Bullish', color: 'var(--color-green)', desc: `S&P 500 up ${pct.toFixed(2)}% — moderate buying pressure` };
  if (pct > -0.25) return { label: 'Neutral / Flat', color: 'var(--color-blue)', desc: `S&P 500 ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}% — consolidation` };
  if (pct > -1.5)  return { label: 'Mildly Bearish', color: 'var(--color-yellow)', desc: `S&P 500 down ${Math.abs(pct).toFixed(2)}% — moderate selling` };
  return { label: 'Strong Bearish', color: 'var(--color-red)', desc: `S&P 500 down ${Math.abs(pct).toFixed(2)}% — broad market weakness` };
}

function topSectors(sectors: SectorPerformance[]): { best: SectorPerformance | null; worst: SectorPerformance | null } {
  if (!sectors.length) return { best: null, worst: null };
  const sorted = [...sectors].sort((a, b) => b.changePercent1D - a.changePercent1D);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

export default function MacroIndicators({ vix, sectors, indices, news, events, calendarUnavailable }: Props) {
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
              {/* Segmented VIX bar: 4 fixed zones, filled up to current VIX level */}
              <div className="macro-vix-bar">
                {[
                  { max: 15, color: '#22c55e', label: '15' },
                  { max: 20, color: '#3b82f6', label: '20' },
                  { max: 30, color: '#f59e0b', label: '30' },
                  { max: 50, color: '#ef4444', label: '50+' },
                ].map(({ max, color, label }, i, arr) => {
                  const zoneMin = i === 0 ? 0 : arr[i - 1].max;
                  const zoneWidth = (max - zoneMin) / 50; // fraction of total bar
                  const filled = Math.min(Math.max(vix.price - zoneMin, 0), max - zoneMin) / (max - zoneMin);
                  return (
                    <div
                      key={label}
                      className="macro-vix-zone"
                      style={{ flex: zoneWidth }}
                    >
                      <div
                        className="macro-vix-zone-fill"
                        style={{ width: `${filled * 100}%`, background: color }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="macro-vix-scale">
                <span>0</span><span>15</span><span>20</span><span>30</span><span>50+</span>
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
                .map(s => {
                  const pct = s.changePercent1D;
                  // Max 3% = full half-bar (50% of track)
                  const halfPct = Math.min(Math.abs(pct) / 3 * 50, 50);
                  const isUp = pct >= 0;
                  return (
                    <div key={s.sector} className="macro-mini-bar-row">
                      <span className="macro-mini-bar-label">{s.etfSymbol}</span>
                      <div className="macro-mini-bar-track">
                        <div
                          className="macro-mini-bar-fill"
                          style={{
                            width: `${halfPct}%`,
                            background: isUp ? '#22c55e' : '#ef4444',
                            left: isUp ? '50%' : `${50 - halfPct}%`,
                          }}
                        />
                      </div>
                      <span
                        className="macro-mini-bar-pct"
                        style={{ color: isUp ? 'var(--color-green)' : 'var(--color-red)' }}
                      >
                        {isUp ? '+' : ''}{pct.toFixed(2)}%
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

      </div>

      {/* Market News + Economic Calendar — side by side below the 3-card row */}
      <div className="macro-bottom-row">
        <div className="macro-card macro-card--news">
          <div className="macro-card-label">Market News</div>
          <MarketNews news={news} compact />
        </div>
        <div className="macro-card macro-card--news">
          <div className="macro-card-label">Economic Calendar</div>
          <EconomicCalendar events={events} unavailable={calendarUnavailable} />
        </div>
      </div>
    </div>
  );
}
