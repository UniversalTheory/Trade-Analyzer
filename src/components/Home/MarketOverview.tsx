import { useCallback, useEffect, useState } from 'react';
import { market } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import type { QuoteData, MoverData, NewsItem, SectorPerformance } from '../../api/types';
import IndexCard from './IndexCard';
import MacroIndicators from './MacroIndicators';
import TopMovers from './TopMovers';
import MarketNews from './MarketNews';
import LoadingState from '../common/LoadingState';
import ErrorState from '../common/ErrorState';

const INDEX_SYMBOLS = ['^GSPC', '^IXIC', '^DJI', '^RUT', '^VIX'];
const AUTO_REFRESH_MS = 2 * 60 * 1000;  // 2 minutes
const LIVE_REFRESH_MS = 30 * 1000;       // 30 seconds

function LastUpdated({ time }: { time: Date | null }) {
  if (!time) return null;
  return (
    <span className="last-updated">
      Updated {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </span>
  );
}

export default function MarketOverview() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [live, setLive] = useState(false);

  const onSuccess = useCallback(() => setLastUpdated(new Date()), []);

  // Auto-refresh interval — faster in live mode
  useEffect(() => {
    const id = setInterval(
      () => setRefreshKey(k => k + 1),
      live ? LIVE_REFRESH_MS : AUTO_REFRESH_MS,
    );
    return () => clearInterval(id);
  }, [live]);

  const indices = useApi<QuoteData[]>(
    () => market.getIndices(live).then(d => { onSuccess(); return d; }),
    [refreshKey, live],
  );

  const movers = useApi<MoverData>(
    () => market.getMovers(live),
    [refreshKey, live],
  );

  const news = useApi<NewsItem[]>(
    () => market.getNews(),
    [refreshKey],
  );

  const sectors = useApi<SectorPerformance[]>(
    () => market.getSectors(),
    [refreshKey],
  );

  const isLoading = indices.loading || movers.loading || news.loading || sectors.loading;
  const hasError = !isLoading && (indices.error || movers.error);

  function handleRefresh() {
    setRefreshKey(k => k + 1);
  }

  const vix = indices.data?.find(q => q.symbol === '^VIX') ?? null;

  return (
    <div className="market-overview">
      {/* Dashboard Header */}
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title">Market Overview</div>
          <div className="dashboard-subtitle">
            {live ? 'Live mode — refreshing every 30 seconds' : 'Auto-refreshes every 2 minutes'}
          </div>
        </div>
        <div className="dashboard-actions">
          <LastUpdated time={lastUpdated} />
          <button
            className={`live-toggle-btn${live ? ' active' : ''}`}
            onClick={() => setLive(l => !l)}
            title={live ? 'Live mode on — refreshes every 30s' : 'Enable live mode (30s refresh)'}
          >
            <span className={`live-dot${live ? ' pulse' : ''}`} />
            Live
          </button>
          <button
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? '⟳ Loading…' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {hasError && (
        <ErrorState
          message="Could not load market data. Make sure the API server is running (`npm run dev`)."
          onRetry={handleRefresh}
        />
      )}

      {/* Index Cards Row */}
      <div className="indices-row">
        {isLoading && !indices.data
          ? INDEX_SYMBOLS.map(sym => (
              <div key={sym} className="index-card-skeleton">
                <LoadingState rows={3} height={18} />
              </div>
            ))
          : (indices.data ?? []).map(quote => (
              <IndexCard
                key={quote.symbol}
                quote={quote}
                isVix={quote.symbol === '^VIX'}
              />
            ))
        }
      </div>

      {/* Middle Row: Macro + Sectors */}
      <div className="dashboard-row">
        <div className="dashboard-col-wide">
          {sectors.loading && !sectors.data
            ? <div className="panel-card"><LoadingState rows={4} height={24} /></div>
            : <MacroIndicators
                vix={vix}
                sectors={sectors.data ?? []}
                indices={indices.data ?? []}
              />
          }
        </div>
      </div>

      {/* Bottom Row: Movers + News */}
      <div className="dashboard-row">
        <div className="dashboard-col-half">
          {movers.loading && !movers.data
            ? <div className="panel-card"><LoadingState rows={6} height={36} /></div>
            : <TopMovers data={movers.data ?? { gainers: [], losers: [] }} />
          }
        </div>
        <div className="dashboard-col-half">
          {news.loading && !news.data
            ? <div className="panel-card"><LoadingState rows={6} height={52} /></div>
            : <MarketNews news={news.data ?? []} />
          }
        </div>
      </div>
    </div>
  );
}
