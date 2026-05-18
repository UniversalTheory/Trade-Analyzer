import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AddPositionForm from './AddPositionForm';
import PortfolioTable from './PortfolioTable';
import type { PositionEdit } from './EditPositionRow';
import AnalysisCard from './AnalysisCard';
import { AnimatedNumber } from '../AnimatedNumber';
import { ticker } from '../../api/client';
import type { QuoteData, PriceBar, AssetProfile } from '../../api/types';
import {
  loadPortfolio,
  savePortfolio,
  type PortfolioState,
  type StockPosition,
} from '../../utils/portfolioStorage';
import {
  computePortfolioTotals,
  computePortfolioPeriodTotals,
  fmtUSD,
  fmtPct,
  signed,
} from '../../utils/portfolioCalc';
import type { LookbackId } from '../../utils/portfolioRisk';

const REFRESH_INTERVAL_MS = 30_000;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function tenYearsAgoISO(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 10);
  return d.toISOString().slice(0, 10);
}

function fmtDateLong(iso: string): string {
  // 'YYYY-MM-DD' → 'Mar 15, 2024'. Build from parts so we don't get TZ shifts.
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  onShowInResearch?: (symbol: string) => void;
}

export default function Portfolio({ onShowInResearch }: Props) {
  const [state, setState] = useState<PortfolioState>(loadPortfolio);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [history, setHistory] = useState<Record<string, PriceBar[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, AssetProfile>>({});
  const [profileLoading, setProfileLoading] = useState(false);
  const [spyHistory, setSpyHistory] = useState<PriceBar[] | undefined>(undefined);
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [riskLookback, setRiskLookback] = useState<LookbackId>('1y');
  const [refreshing, setRefreshing] = useState(false);
  const [cashInput, setCashInput] = useState(String(state.cash || ''));
  const cashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist on every state change.
  useEffect(() => {
    savePortfolio(state);
  }, [state]);

  const fetchQuotes = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) {
      setQuotes({});
      return;
    }
    setRefreshing(true);
    const results = await Promise.allSettled(
      symbols.map(sym => ticker.getQuote(sym).then(q => ({ sym, q }))),
    );
    setQuotes(prev => {
      const next = { ...prev };
      // Drop quotes for symbols that no longer exist.
      for (const sym of Object.keys(next)) {
        if (!symbols.includes(sym)) delete next[sym];
      }
      for (const r of results) {
        if (r.status === 'fulfilled') next[r.value.sym] = r.value.q;
      }
      return next;
    });
    setRefreshing(false);
  }, []);

  // Initial fetch + when positions list changes.
  const symbolsKey = state.positions.map(p => p.symbol).join(',');
  useEffect(() => {
    fetchQuotes(state.positions.map(p => p.symbol));
  }, [fetchQuotes, symbolsKey]);

  // Auto-refresh every 30s.
  useEffect(() => {
    if (state.positions.length === 0) return;
    const id = setInterval(() => {
      fetchQuotes(state.positions.map(p => p.symbol));
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchQuotes, symbolsKey, state.positions.length]);

  // Fetch profile (sector, country, fund category) for any symbols missing it.
  // Profile data is essentially static; we fetch once per symbol per session.
  useEffect(() => {
    if (state.positions.length === 0) return;
    const missing = state.positions
      .map(p => p.symbol)
      .filter(sym => !(sym in profiles));
    if (missing.length === 0) return;

    let cancelled = false;
    setProfileLoading(true);
    Promise.all(
      missing.map(sym =>
        ticker.getProfile(sym)
          .then(prof => ({ sym, prof }))
          .catch(() => ({ sym, prof: { symbol: sym, description: '' } as AssetProfile })),
      ),
    ).then(results => {
      if (cancelled) return;
      setProfiles(prev => {
        const next = { ...prev };
        for (const r of results) next[r.sym] = r.prof;
        return next;
      });
      setProfileLoading(false);
    });
    return () => { cancelled = true; };
  }, [symbolsKey, profiles, state.positions]);

  // Fetch daily history for any symbols missing it.
  // Triggered when the user picks a period date OR expands the Analysis card.
  useEffect(() => {
    const needHistory = !!state.selectedDate || analysisExpanded;
    if (!needHistory || state.positions.length === 0) return;
    const missing = state.positions
      .map(p => p.symbol)
      .filter(sym => !(sym in history));
    if (missing.length === 0) return;

    let cancelled = false;
    setHistoryLoading(true);
    // Each promise resolves with {sym, bars}; failures store [] so we don't loop-fetch.
    Promise.all(
      missing.map(sym =>
        ticker.getHistory(sym, '10y', '1d')
          .then(bars => ({ sym, bars }))
          .catch(() => ({ sym, bars: [] as PriceBar[] })),
      ),
    ).then(results => {
      if (cancelled) return;
      setHistory(prev => {
        const next = { ...prev };
        for (const r of results) next[r.sym] = r.bars;
        return next;
      });
      setHistoryLoading(false);
    });
    return () => { cancelled = true; };
  }, [state.selectedDate, analysisExpanded, symbolsKey, history, state.positions]);

  // SPY history is needed for portfolio beta. Fetch once when analysis is first expanded.
  useEffect(() => {
    if (!analysisExpanded || spyHistory !== undefined) return;
    let cancelled = false;
    ticker.getHistory('SPY', '10y', '1d')
      .then(bars => { if (!cancelled) setSpyHistory(bars); })
      .catch(() => { if (!cancelled) setSpyHistory([]); });
    return () => { cancelled = true; };
  }, [analysisExpanded, spyHistory]);

  function handleAdd(position: StockPosition, initialQuote: QuoteData) {
    setState(s => ({ ...s, positions: [...s.positions, position] }));
    setQuotes(prev => ({ ...prev, [position.symbol]: initialQuote }));
  }

  function handleUpdate(id: string, patch: PositionEdit) {
    setState(s => ({
      ...s,
      positions: s.positions.map(p =>
        p.id === id && p.type === 'stock'
          ? { ...p, shares: patch.shares, avgPrice: patch.avgPrice, addedAt: patch.addedAt }
          : p,
      ),
    }));
  }

  function handleRemove(id: string) {
    setState(s => {
      const removed = s.positions.find(p => p.id === id);
      const next = s.positions.filter(p => p.id !== id);
      if (removed) {
        setQuotes(prev => {
          const copy = { ...prev };
          delete copy[removed.symbol];
          return copy;
        });
        setHistory(prev => {
          const copy = { ...prev };
          delete copy[removed.symbol];
          return copy;
        });
        setProfiles(prev => {
          const copy = { ...prev };
          delete copy[removed.symbol];
          return copy;
        });
      }
      return { ...s, positions: next };
    });
  }

  function handleDateChange(value: string) {
    setState(s => ({ ...s, selectedDate: value || null }));
  }

  function handleCashChange(raw: string) {
    setCashInput(raw);
    const num = parseFloat(raw);
    const safe = isFinite(num) && num >= 0 ? num : 0;
    if (cashTimer.current) clearTimeout(cashTimer.current);
    cashTimer.current = setTimeout(() => {
      setState(s => ({ ...s, cash: safe }));
    }, 250);
  }

  const priceBySymbol: Record<string, number | undefined> = {};
  for (const p of state.positions) {
    priceBySymbol[p.symbol] = quotes[p.symbol]?.price;
  }
  const totals = computePortfolioTotals(state.positions, priceBySymbol, state.cash);

  const plColor = totals.totalPL >= 0 ? 'var(--color-green)' : 'var(--color-red)';

  const periodTotals = useMemo(() => {
    if (!state.selectedDate) return null;
    return computePortfolioPeriodTotals(state.positions, priceBySymbol, history, state.selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.selectedDate, symbolsKey, quotes, history, state.positions]);

  const periodColor = periodTotals && periodTotals.pl >= 0
    ? 'var(--color-green)'
    : 'var(--color-red)';

  const someHistoryMissing = state.positions.some(p => !(p.symbol in history));
  const periodWaiting = !!state.selectedDate
    && state.positions.length > 0
    && (historyLoading || someHistoryMissing);

  const someProfileMissing = state.positions.some(p => !(p.symbol in profiles));

  const minDate = tenYearsAgoISO();
  const maxDate = todayISO();

  return (
    <div className="portfolio-page">
      <div className="portfolio-header">
        <div>
          <h2 className="portfolio-title">Portfolio</h2>
          <div className="portfolio-subtitle">
            {state.positions.length} position{state.positions.length !== 1 ? 's' : ''}
            {state.positions.length > 0 && ` · auto-refresh 30s`}
          </div>
        </div>
        <button
          className="portfolio-refresh-btn"
          onClick={() => fetchQuotes(state.positions.map(p => p.symbol))}
          disabled={refreshing || state.positions.length === 0}
        >
          {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="panel-card portfolio-card">
        <AddPositionForm
          existingSymbols={state.positions.map(p => p.symbol)}
          onAdd={handleAdd}
        />

        <PortfolioTable
          positions={state.positions}
          quotes={quotes}
          onRemove={handleRemove}
          onUpdate={handleUpdate}
          onShowInResearch={onShowInResearch}
        />

        <div className="portfolio-cash-row">
          <label className="portfolio-cash-label" htmlFor="portfolio-cash-input">
            Cash
          </label>
          <div className="portfolio-cash-input-wrap">
            <span className="portfolio-cash-prefix">$</span>
            <input
              id="portfolio-cash-input"
              className="portfolio-input portfolio-cash-input"
              type="number"
              min="0"
              step="any"
              value={cashInput}
              onChange={e => handleCashChange(e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="portfolio-totals">
          <div className="portfolio-totals-row">
            <span className="portfolio-totals-label">Holdings total</span>
            <span className="portfolio-totals-value">
              <AnimatedNumber value={totals.holdingsTotal} format={fmtUSD} prefix="$" />
            </span>
          </div>
          <div className="portfolio-totals-row">
            <span className="portfolio-totals-label">+ Cash</span>
            <span className="portfolio-totals-value">${fmtUSD(state.cash)}</span>
          </div>
          <div className="portfolio-totals-row portfolio-totals-grand">
            <span className="portfolio-totals-label">Total portfolio</span>
            <span className="portfolio-totals-value">
              <AnimatedNumber value={totals.totalPortfolio} format={fmtUSD} prefix="$" />
            </span>
          </div>
          <div className="portfolio-totals-divider" />
          <div className="portfolio-totals-row">
            <span className="portfolio-totals-label">Cost basis</span>
            <span className="portfolio-totals-value">${fmtUSD(totals.totalCostBasis)}</span>
          </div>
          <div className="portfolio-totals-row">
            <span className="portfolio-totals-label">Total P/L</span>
            <span className="portfolio-totals-value" style={{ color: plColor }}>
              {totals.totalCostBasis > 0 ? (
                <>
                  {signed(totals.totalPL)}$<AnimatedNumber value={Math.abs(totals.totalPL)} format={fmtUSD} />
                  {' '}({signed(totals.totalPL)}{fmtPct(totals.totalPLPct)})
                </>
              ) : '—'}
            </span>
          </div>

          <div className="portfolio-totals-divider" />

          <div className="portfolio-period-row">
            <div className="portfolio-period-picker">
              <label className="portfolio-totals-label" htmlFor="portfolio-period-date">
                Period P/L since
              </label>
              <input
                id="portfolio-period-date"
                className="portfolio-input portfolio-period-input"
                type="date"
                min={minDate}
                max={maxDate}
                value={state.selectedDate ?? ''}
                onChange={e => handleDateChange(e.target.value)}
              />
              {state.selectedDate && (
                <button
                  className="portfolio-period-clear"
                  onClick={() => handleDateChange('')}
                  title="Clear date"
                >
                  ×
                </button>
              )}
            </div>

            <div className="portfolio-period-value">
              {!state.selectedDate ? (
                <span className="portfolio-period-hint">Pick a date to compare</span>
              ) : periodWaiting ? (
                <span className="portfolio-period-hint">Loading history…</span>
              ) : !periodTotals || periodTotals.pricedCount === 0 ? (
                <span className="portfolio-period-hint">No data on that date</span>
              ) : (
                <>
                  <span className="portfolio-totals-value" style={{ color: periodColor }}>
                    {signed(periodTotals.pl)}$<AnimatedNumber value={Math.abs(periodTotals.pl)} format={fmtUSD} />
                    {' '}({signed(periodTotals.pl)}{fmtPct(periodTotals.plPct)})
                  </span>
                  <div className="portfolio-period-meta">
                    Since {fmtDateLong(state.selectedDate)}
                    {periodTotals.lateAddCount > 0 && (
                      <span title="These positions were added after the selected date — their cost basis is used as the baseline.">
                        {' · '}{periodTotals.lateAddCount} late-added
                      </span>
                    )}
                    {periodTotals.excludedCount > 0 && (
                      <span title="No price data available on/before the selected date.">
                        {' · '}{periodTotals.excludedCount} excluded
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnalysisCard
        positions={state.positions}
        priceBySymbol={priceBySymbol}
        profileBySymbol={profiles}
        historyBySymbol={history}
        spyHistory={spyHistory}
        cash={state.cash}
        profileLoading={profileLoading}
        someProfileMissing={someProfileMissing}
        historyLoading={historyLoading || (analysisExpanded && spyHistory === undefined)}
        someHistoryMissing={someHistoryMissing}
        riskLookback={riskLookback}
        onRiskLookbackChange={setRiskLookback}
        expanded={analysisExpanded}
        onToggleExpanded={() => setAnalysisExpanded(e => !e)}
        onShowInResearch={onShowInResearch}
      />
    </div>
  );
}
