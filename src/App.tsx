import { useState, useCallback } from 'react';
import OptionsCalculator from './components/OptionsCalculator/OptionsCalculator';
import MarketOverview from './components/Home/MarketOverview';
import SectorResearch from './components/Sector/SectorResearch';
import TickerResearch, { type CalcPrefill } from './components/Ticker/TickerResearch';

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

  const handleAnalyzeInCalculator = useCallback((prefill: CalcPrefill) => {
    setCalcPrefill(prefill);
    setActiveTab('options');
  }, []);

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="logo">Δ</div>
          <div>
            <div className="header-title">Global Markets Looking Glass</div>
            <div className="header-subtitle">Market Research & Analysis</div>
          </div>
        </div>

        <nav className="tab-nav">
          {TABS.map(tab => (
            <button
              key={tab.id}
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
