import { useState } from 'react';
import OptionsCalculator from './components/OptionsCalculator/OptionsCalculator';
import MarketOverview from './components/Home/MarketOverview';

type Tab = 'home' | 'sector' | 'ticker' | 'options';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home',    label: 'Market',   icon: '◈' },
  { id: 'sector',  label: 'Sectors',  icon: '⬡' },
  { id: 'ticker',  label: 'Research', icon: '⌕' },
  { id: 'options', label: 'Options',  icon: 'Δ' },
];

function ComingSoon({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="coming-soon">
      <div className="coming-soon-icon">{icon}</div>
      <div className="coming-soon-title">{title}</div>
      <div className="coming-soon-desc">{desc}</div>
      <div className="coming-soon-badge">Coming in Phase {title === 'Market Overview' ? '3' : title === 'Sector Research' ? '4' : '5'}</div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('home');

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="logo">Δ</div>
          <div>
            <div className="header-title">Options Trade Analyzer</div>
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
        {activeTab === 'home' && <MarketOverview />}
        {activeTab === 'sector' && (
          <ComingSoon
            icon="⬡"
            title="Sector Research"
            desc="Sector dropdown with momentum analysis, news, and risk/opportunity ratings."
          />
        )}
        {activeTab === 'ticker' && (
          <ComingSoon
            icon="⌕"
            title="Ticker Research"
            desc="Search any symbol for price charts, technical analysis, options chain, and trade recommendations."
          />
        )}
        {activeTab === 'options' && <OptionsCalculator />}
      </main>
    </>
  );
}
