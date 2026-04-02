import { useState, useEffect } from 'react';
import SpreadAnalysis from '../SpreadAnalysis/SpreadAnalysis';
import ExpectedMove from '../ExpectedMove/ExpectedMove';
import KellyCriterion from '../KellyCriterion/KellyCriterion';
import BlackScholes from './BlackScholes';
import type { CalcPrefill } from '../Ticker/TickerResearch';

type OptionsTool = 'spread' | 'expected' | 'kelly' | 'blackscholes';

const TOOLS: { id: OptionsTool; label: string; icon: string }[] = [
  { id: 'spread',      label: 'Spread Analysis',  icon: '⊿' },
  { id: 'expected',    label: 'Expected Move',     icon: '↔' },
  { id: 'kelly',       label: 'Position Sizing',   icon: '%' },
  { id: 'blackscholes',label: 'Black-Scholes',     icon: '∫' },
];

interface Props {
  prefill?: CalcPrefill | null;
  onPrefillConsumed?: () => void;
}

export default function OptionsCalculator({ prefill, onPrefillConsumed }: Props) {
  const [activeTool, setActiveTool] = useState<OptionsTool>('spread');

  useEffect(() => {
    if (prefill) {
      setActiveTool('blackscholes');
    }
  }, [prefill]);

  return (
    <div className="options-calculator">
      <div className="sub-tab-nav">
        {TOOLS.map(tool => (
          <button
            key={tool.id}
            className={`sub-tab-btn ${activeTool === tool.id ? 'active' : ''}`}
            onClick={() => setActiveTool(tool.id)}
          >
            <span className="sub-tab-icon">{tool.icon}</span>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="sub-tab-content">
        {activeTool === 'spread'       && <SpreadAnalysis />}
        {activeTool === 'expected'     && <ExpectedMove />}
        {activeTool === 'kelly'        && <KellyCriterion />}
        {activeTool === 'blackscholes' && (
          <BlackScholes prefill={prefill ?? null} onPrefillConsumed={onPrefillConsumed} />
        )}
      </div>
    </div>
  );
}
