import { useEffect, useState } from 'react';
import { market, ticker } from '../../api/client';
import type { MoverData, QuoteData } from '../../api/types';
import LoadingState from '../common/LoadingState';

interface Props {
  refreshKey: number;
  onShowInResearch?: (symbol: string) => void;
}

interface UnusualVolumeRow {
  symbol: string;
  name: string;
  volumeRatio: number;     // volume / avgVolume
  changePercent: number;
  price: number;
}

const UNUSUAL_RATIO = 1.5;
const MAX_ROWS = 8;
const CANDIDATES_PER_SIDE = 8;  // top 8 gainers + top 8 losers

export default function AcrossTheMarket({ refreshKey, onShowInResearch }: Props) {
  const [rows, setRows] = useState<UnusualVolumeRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    market.getMovers()
      .then((movers: MoverData) => {
        const candidates = [
          ...movers.gainers.slice(0, CANDIDATES_PER_SIDE),
          ...movers.losers.slice(0, CANDIDATES_PER_SIDE),
        ];
        if (candidates.length === 0) {
          if (!cancelled) {
            setRows([]);
            setLoading(false);
          }
          return;
        }
        return Promise.allSettled(
          candidates.map(c =>
            ticker.getQuote(c.symbol).then(q => ({ mover: c, quote: q })),
          ),
        ).then(results => {
          if (cancelled) return;
          const enriched: UnusualVolumeRow[] = [];
          for (const r of results) {
            if (r.status !== 'fulfilled') continue;
            const { mover, quote } = r.value as { mover: typeof candidates[number]; quote: QuoteData };
            const avg = quote.avgVolume;
            if (!avg || avg <= 0) continue;
            const ratio = quote.volume / avg;
            if (ratio < UNUSUAL_RATIO) continue;
            enriched.push({
              symbol: mover.symbol,
              name: mover.name || quote.name || mover.symbol,
              volumeRatio: ratio,
              changePercent: quote.changePercent,
              price: quote.price,
            });
          }
          enriched.sort((a, b) => b.volumeRatio - a.volumeRatio);
          setRows(enriched.slice(0, MAX_ROWS));
          setLoading(false);
        });
      })
      .catch(err => {
        if (!cancelled) {
          setError(err?.message || 'Failed to load market activity');
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <section className="panel-card briefing-section">
      <div className="briefing-section-header">
        <h3 className="briefing-section-title">Unusual Market Activity</h3>
        <span className="briefing-mini-meta">Unusual volume · ≥{UNUSUAL_RATIO.toFixed(1)}× average</span>
      </div>

      {loading ? (
        <LoadingState rows={3} height={22} />
      ) : error ? (
        <div className="briefing-empty-state">Could not load market activity. {error}</div>
      ) : rows.length === 0 ? (
        <div className="briefing-empty-line">
          No tickers trading on unusually heavy volume right now.
        </div>
      ) : (
        <div className="briefing-watch-list">
          {rows.map(r => {
            const clickable = !!onShowInResearch;
            const up = r.changePercent >= 0;
            const color = up ? 'var(--color-green)' : 'var(--color-red)';
            return (
              <div
                key={r.symbol}
                className={`briefing-activity-row${clickable ? ' clickable-asset-row' : ''}`}
                onClick={clickable ? () => onShowInResearch!(r.symbol) : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                onKeyDown={clickable
                  ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowInResearch!(r.symbol); } }
                  : undefined}
              >
                <span className="briefing-activity-sym">{r.symbol}</span>
                <span className="briefing-activity-name">{r.name}</span>
                <span className="briefing-activity-ratio">{r.volumeRatio.toFixed(1)}×</span>
                <span className="briefing-activity-change" style={{ color }}>
                  {up ? '+' : ''}{r.changePercent.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
