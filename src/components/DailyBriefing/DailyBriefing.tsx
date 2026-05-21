import { useEffect, useRef, useState } from 'react';
import MarketPulse from './MarketPulse';
import YourPortfolioToday from './YourPortfolioToday';
import AcrossTheMarket from './AcrossTheMarket';
import WhatToWatch from './WhatToWatch';
import AICommentary from './AICommentary';
import { fmtClockTime, fmtTimeAgo } from './timeHelpers';

interface Props {
  onShowInResearch?: (symbol: string) => void;
}

type AutoRefresh = 'off' | '15' | '30' | '60';

const AUTO_REFRESH_STORAGE_KEY = 'briefing_refresh';
const AUTO_REFRESH_OPTIONS: { value: AutoRefresh; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: '15',  label: '15 min' },
  { value: '30',  label: '30 min' },
  { value: '60',  label: '1 hr' },
];

function loadAutoRefresh(): AutoRefresh {
  try {
    const v = localStorage.getItem(AUTO_REFRESH_STORAGE_KEY);
    if (v === 'off' || v === '15' || v === '30' || v === '60') return v;
  } catch { /* ignore */ }
  return 'off';
}

export default function DailyBriefing({ onShowInResearch }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefreshAt, setLastRefreshAt] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState<AutoRefresh>(() => loadAutoRefresh());
  const [nowTick, setNowTick] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick once a minute so the "X min ago" label refreshes without forcing data refetch.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  // Manage the auto-refresh interval.
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoRefresh === 'off') return;
    const ms = parseInt(autoRefresh, 10) * 60 * 1000;
    intervalRef.current = setInterval(() => {
      setRefreshKey(k => k + 1);
      setLastRefreshAt(new Date());
    }, ms);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh]);

  function handleRefresh() {
    setRefreshKey(k => k + 1);
    setLastRefreshAt(new Date());
  }

  function handleAutoRefreshChange(value: AutoRefresh) {
    setAutoRefresh(value);
    try {
      localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, value);
    } catch { /* ignore */ }
  }

  return (
    <div className="market-overview briefing-page">
      <div className="dashboard-header">
        <div>
          <div className="dashboard-title">Daily Briefing</div>
          <div className="dashboard-subtitle">
            Refreshed {fmtClockTime(lastRefreshAt)} · {fmtTimeAgo(lastRefreshAt.getTime(), nowTick)}
          </div>
        </div>
        <div className="dashboard-actions">
          <label className="briefing-auto-refresh">
            <span className="briefing-auto-refresh-label">Auto-refresh</span>
            <select
              className="briefing-auto-refresh-select"
              value={autoRefresh}
              onChange={e => handleAutoRefreshChange(e.target.value as AutoRefresh)}
            >
              {AUTO_REFRESH_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <button className="refresh-btn" onClick={handleRefresh}>
            ⟳ Refresh
          </button>
        </div>
      </div>

      <MarketPulse refreshKey={refreshKey} />
      <YourPortfolioToday refreshKey={refreshKey} onShowInResearch={onShowInResearch} />
      <AcrossTheMarket refreshKey={refreshKey} onShowInResearch={onShowInResearch} />
      <WhatToWatch refreshKey={refreshKey} />
      <AICommentary refreshKey={refreshKey} />
    </div>
  );
}
