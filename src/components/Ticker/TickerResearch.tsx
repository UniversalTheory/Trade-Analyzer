import { useState, useCallback } from 'react';
import { ticker as tickerApi } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import type { PriceBar, QuoteData, OptionContract, OptionsChainData, AssetProfile, FundamentalsData, FilingsData, EarningsData } from '../../api/types';
import SymbolSearch from './SymbolSearch';
import TickerQuoteCard from './TickerQuoteCard';
import AssetProfileCard from './AssetProfile';
import FundamentalsCard from './FundamentalsCard';
import FilingsCard from './FilingsCard';
import EarningsCard from './EarningsCard';
import PriceChart from './PriceChart';
import TechnicalIndicators from './TechnicalIndicators';
import OptionsChain from './OptionsChain';
import TradeRecommendations from './TradeRecommendations';

type Range = '1m' | '3m' | '6m' | '1y' | '2y';

export interface CalcPrefill {
  symbol: string;
  stockPrice: string;
  volatility: string;
}

interface Props {
  onAnalyzeInCalculator: (prefill: CalcPrefill) => void;
}

export default function TickerResearch({ onAnalyzeInCalculator }: Props) {
  const [symbol, setSymbol] = useState('');
  const [range, setRange] = useState<Range>('3m');

  const {
    data: quote,
    loading: quoteLoading,
    error: quoteError,
  } = useApi<QuoteData>(
    () => tickerApi.getQuote(symbol),
    [symbol],
    { autoFetch: !!symbol },
  );

  const { data: profile } = useApi<AssetProfile>(
    () => tickerApi.getProfile(symbol),
    [symbol],
    { autoFetch: !!symbol },
  );

  const { data: fundamentals } = useApi<FundamentalsData>(
    () => tickerApi.getFundamentals(symbol),
    [symbol],
    { autoFetch: !!symbol },
  );

  const { data: filings } = useApi<FilingsData>(
    () => tickerApi.getFilings(symbol),
    [symbol],
    { autoFetch: !!symbol },
  );

  const { data: earnings } = useApi<EarningsData>(
    () => tickerApi.getEarnings(symbol),
    [symbol],
    { autoFetch: !!symbol },
  );

  const { data: optionsChain } = useApi<OptionsChainData>(
    () => tickerApi.getOptions(symbol),
    [symbol],
    { autoFetch: !!symbol },
  );

  const {
    data: bars,
    loading: barsLoading,
    refetch: refetchBars,
  } = useApi<PriceBar[]>(
    () => tickerApi.getHistory(symbol, range),
    [symbol, range],
    { autoFetch: !!symbol },
  );

  const handleSymbolSelect = useCallback((sym: string) => {
    setSymbol(sym);
    setRange('3m');
  }, []);

  const handleRangeChange = useCallback((r: Range) => {
    setRange(r);
  }, []);

  const handleAnalyze = useCallback(
    (contract: OptionContract) => {
      if (!quote) return;
      const iv = (contract.impliedVolatility * 100).toFixed(1);
      onAnalyzeInCalculator({
        symbol: quote.symbol,
        stockPrice: quote.price.toFixed(2),
        volatility: iv,
      });
    },
    [quote, onAnalyzeInCalculator],
  );

  return (
    <div className="ticker-research">
      <div className="ticker-search-row">
        <SymbolSearch onSelect={handleSymbolSelect} />
      </div>

      {!symbol && (
        <div className="ticker-empty">
          <div className="ticker-empty-icon">⌕</div>
          <div className="ticker-empty-title">Ticker Research</div>
          <div className="ticker-empty-desc">
            Search any stock, ETF, or index to view price charts, technical analysis, options chain, and trade recommendations.
          </div>
        </div>
      )}

      {symbol && quoteError && (
        <div className="error-msg" style={{ margin: '2rem auto', maxWidth: 500 }}>
          Failed to load {symbol}: {quoteError}
        </div>
      )}

      {symbol && quoteLoading && !quote && (
        <div className="ticker-loading">
          <div className="spinner large" />
          <span>Loading {symbol}…</span>
        </div>
      )}

      {symbol && quote && (
        <div className="ticker-content">
          <TickerQuoteCard quote={quote} />

          {profile && <AssetProfileCard profile={profile} />}

          {fundamentals && <FundamentalsCard data={fundamentals} />}

          <div className="ticker-side-row">
            {filings && <FilingsCard data={filings} irWebsite={profile?.irWebsite} />}
            {earnings && <EarningsCard data={earnings} />}
          </div>

          <PriceChart
            bars={bars ?? []}
            range={range}
            onRangeChange={handleRangeChange}
            loading={barsLoading}
          />

          {bars && bars.length >= 30 && (
            <TechnicalIndicators bars={bars} />
          )}

          <TradeRecommendations quote={quote} bars={bars ?? []} fundamentals={fundamentals ?? undefined} optionsChain={optionsChain ?? undefined} />

          <OptionsChain
            symbol={symbol}
            currentPrice={quote.price}
            onAnalyze={handleAnalyze}
          />
        </div>
      )}
    </div>
  );
}
