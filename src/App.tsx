import { useState } from 'react';
import SpreadAnalysis from './components/SpreadAnalysis/SpreadAnalysis';
import ExpectedMove from './components/ExpectedMove/ExpectedMove';
import KellyCriterion from './components/KellyCriterion/KellyCriterion';

type Tab = 'spread' | 'expected' | 'kelly';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'spread',   label: 'Spread Analysis', icon: '⊿' },
  { id: 'expected', label: 'Expected Move',    icon: '↔' },
  { id: 'kelly',    label: 'Position Sizing',  icon: '%' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('spread');

  return (
    <>
      <header className="header">
        <div className="header-left">
          <div className="logo">Δ</div>
          <div>
            <div className="header-title">Options Trade Analyzer</div>
            <div className="header-subtitle">Pre-Trade Decision Tool</div>
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
        {activeTab === 'spread'   && <SpreadAnalysis />}
        {activeTab === 'expected' && <ExpectedMove />}
        {activeTab === 'kelly'    && <KellyCriterion />}
      </main>
    </>
  );
}
