import { useState } from 'react';
import { sector as sectorApi } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { calcSectorScore } from '../../utils/sectorAnalysis';
import type { SectorDefinition, QuoteData, PriceBar, NewsItem } from '../../api/types';
import SectorSelector from './SectorSelector';
import SectorOverview from './SectorOverview';
import SectorMomentum from './SectorMomentum';
import RiskOpportunityGauge from './RiskOpportunityGauge';
import SectorNews from './SectorNews';
import LoadingState from '../common/LoadingState';
import ErrorState from '../common/ErrorState';

const DEFAULT_SECTOR = 'technology';

export default function SectorResearch() {
  const [selectedId, setSelectedId] = useState(DEFAULT_SECTOR);

  // Load sector definitions once
  const { data: sectors } = useApi<SectorDefinition[]>(
    () => sectorApi.getList(),
    [],
  );

  const selectedSector = sectors?.find(s => s.id === selectedId) ?? null;
  const etf = selectedSector?.etf ?? '';

  // Load sector ETF data whenever selection changes
  const { data: quote, loading: quoteLoading, error: quoteError, refetch: refetchQuote } = useApi<QuoteData>(
    () => sectorApi.getQuote(etf),
    [etf],
    { autoFetch: !!etf },
  );

  const { data: history, loading: historyLoading, refetch: refetchHistory } = useApi<PriceBar[]>(
    () => sectorApi.getHistory(etf, '3m'),
    [etf],
    { autoFetch: !!etf },
  );

  const { data: spyHistory } = useApi<PriceBar[]>(
    () => sectorApi.getHistory('SPY', '3m'),
    [],
  );

  const { data: news, loading: newsLoading, refetch: refetchNews } = useApi<NewsItem[]>(
    () => sectorApi.getNews(etf),
    [etf],
    { autoFetch: !!etf },
  );

  const isLoading = quoteLoading || historyLoading;

  const score =
    quote && history && spyHistory && history.length > 20
      ? calcSectorScore(quote, history, spyHistory)
      : null;

  function handleRefresh() {
    refetchQuote();
    refetchHistory();
    refetchNews();
  }

  return (
    <div className="sector-research">
      {/* Selector bar */}
      <div className="sector-top-bar">
        <SectorSelector
          sectors={sectors ?? []}
          selectedId={selectedId}
          onChange={setSelectedId}
        />
        <button
          className="refresh-btn"
          onClick={handleRefresh}
          disabled={isLoading}
        >
          {isLoading ? '⟳ Loading…' : '⟳ Refresh'}
        </button>
      </div>

      {/* Error state */}
      {quoteError && (
        <ErrorState
          message={`Could not load data for ${etf}. Make sure the API server is running.`}
          onRetry={handleRefresh}
        />
      )}

      {/* Main content */}
      {selectedSector && (
        <div className="sector-content">
          {/* Left column: Overview + Momentum */}
          <div className="sector-col-left">
            {isLoading && !quote ? (
              <div className="panel-card"><LoadingState rows={5} height={28} /></div>
            ) : quote && history ? (
              <SectorOverview sector={selectedSector} quote={quote} history={history} />
            ) : null}

            {isLoading && !score ? (
              <div className="panel-card" style={{ marginTop: 16 }}><LoadingState rows={4} height={22} /></div>
            ) : score ? (
              <SectorMomentum score={score} />
            ) : null}
          </div>

          {/* Right column: Gauge + News */}
          <div className="sector-col-right">
            {score ? (
              <RiskOpportunityGauge score={score} sectorName={selectedSector.name} />
            ) : (
              <div className="panel-card"><LoadingState rows={4} height={22} /></div>
            )}

            {newsLoading && !news ? (
              <div className="panel-card" style={{ marginTop: 16 }}><LoadingState rows={5} height={52} /></div>
            ) : (
              <SectorNews news={news ?? []} sectorName={selectedSector.name} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
