import { useState } from 'react';
import SpreadAnalysis from '../SpreadAnalysis/SpreadAnalysis';
import ExpectedMove from '../ExpectedMove/ExpectedMove';
import KellyCriterion from '../KellyCriterion/KellyCriterion';
import BlackScholes from './BlackScholes';

type OptionsTool = 'spread' | 'expected' | 'kelly' | 'blackscholes';

const TOOLS: { id: OptionsTool; label: string; icon: string }[] = [
  { id: 'spread',      label: 'Spread Analysis',  icon: '⊿' },
  { id: 'expected',    label: 'Expected Move',     icon: '↔' },
  { id: 'kelly',       label: 'Position Sizing',   icon: '%' },
  { id: 'blackscholes',label: 'Black-Scholes',     icon: '∫' },
];

export default function OptionsCalculator() {
  const [activeTool, setActiveTool] = useState<OptionsTool>('spread');

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
        {activeTool === 'blackscholes' && <BlackScholes />}
      </div>
    </div>
  );
}
