import { useState, useCallback, useEffect, useRef } from 'react';
import OptionsCalculator from './components/OptionsCalculator/OptionsCalculator';
import MarketOverview from './components/Home/MarketOverview';
import SectorResearch from './components/Sector/SectorResearch';
import TickerResearch, { type CalcPrefill } from './components/Ticker/TickerResearch';
import { useRevealObserver } from './hooks/useRevealObserver';

type Tab = 'home' | 'sector' | 'ticker' | 'options';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home',    label: 'Market',   icon: '◈' },
  { id: 'sector',  label: 'Sectors',  icon: '⬡' },
  { id: 'ticker',  label: 'Research', icon: '⌕' },
  { id: 'options', label: 'Options',  icon: 'Δ' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [calcPrefill, setCalcPrefill] = useState<CalcPrefill | null>(null);

  // Sliding tab indicator
  const navRef = useRef<HTMLElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const nav = navRef.current;
    const activeIdx = TABS.findIndex(t => t.id === activeTab);
    const btn = btnRefs.current[activeIdx];
    if (!nav || !btn) return;

    const navRect = nav.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setIndicator({
      left:  btnRect.left  - navRect.left,
      width: btnRect.width,
    });
  }, [activeTab]);

  const handleAnalyzeInCalculator = useCallback((prefill: CalcPrefill) => {
    setCalcPrefill(prefill);
    setActiveTab('options');
  }, []);

  useRevealObserver(activeTab);

  return (
    <>
      <header className="header">
        <div className="header-left">
          <img src="/Analyzer_logo_updated.png" alt="Analyzer logo" className="logo" onClick={() => setActiveTab('home')} style={{ cursor: 'pointer' }} />
          <div>
            <div className="header-title">Global Markets Looking Glass</div>
            <div className="header-subtitle">Market Research & Analysis</div>
          </div>
        </div>

        <nav className="tab-nav" ref={navRef}>
          {/* Sliding active-tab pill — animates between tab positions */}
          {indicator && (
            <span
              className="tab-indicator"
              style={{ left: indicator.left, width: indicator.width }}
              aria-hidden="true"
            />
          )}
          {TABS.map((tab, i) => (
            <button
              key={tab.id}
              ref={el => { btnRefs.current[i] = el; }}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main-content">
        <div className={activeTab === 'home' ? '' : 'tab-hidden'}><MarketOverview /></div>
        <div className={activeTab === 'sector' ? '' : 'tab-hidden'}><SectorResearch /></div>
        <div className={activeTab === 'ticker' ? '' : 'tab-hidden'}>
          <TickerResearch onAnalyzeInCalculator={handleAnalyzeInCalculator} />
        </div>
        <div className={activeTab === 'options' ? '' : 'tab-hidden'}>
          <OptionsCalculator
            prefill={calcPrefill}
            onPrefillConsumed={() => setCalcPrefill(null)}
          />
        </div>
      </main>
    </>
  );
}
