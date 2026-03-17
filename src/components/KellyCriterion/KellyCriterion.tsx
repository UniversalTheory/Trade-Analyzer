import { useState } from 'react';
import type { KellyInputs } from '../../utils/types';
import { calcKelly } from '../../utils/kellyCalculations';
import ResultCard from '../common/ResultCard';
import ResultItem from '../common/ResultItem';
import InterpretationBox from '../common/InterpretationBox';

const fmt = (n: number) => n.toFixed(2);
const fmtDollar = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

function emptyInputs(): KellyInputs {
  return { account: 0, pop: 0, profit: 0, loss: 0, cost: 0 };
}

export default function KellyCriterion() {
  const [inputs, setInputs] = useState<KellyInputs>(emptyInputs());
  const [result, setResult] = useState<ReturnType<typeof calcKelly>>(null);
  const [error, setError] = useState('');

  const num = (field: keyof KellyInputs, value: string) =>
    setInputs(prev => ({ ...prev, [field]: value === '' ? 0 : parseFloat(value) }));

  const handleCalc = () => {
    const r = calcKelly(inputs);
    if (!r) { setError('Please fill in all fields.'); setResult(null); }
    else { setError(''); setResult(r); }
  };

  const riskClass = (pct: number) =>
    pct <= 2 ? 'risk-low' : pct <= 5 ? 'risk-medium' : pct <= 10 ? 'risk-high' : 'risk-extreme';

  return (
    <div className="tab-panel active">
      {/* ── Input Panel ── */}
      <div className="input-panel">
        <div className="panel-title">Position Sizing Inputs</div>

        <div className="form-group">
          <label className="form-label">Total Account Size</label>
          <input className="form-input" type="number" placeholder="e.g. 50000"
            onChange={e => num('account', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Probability of Profit (%)</label>
          <input className="form-input" type="number" placeholder="e.g. 65"
            onChange={e => num('pop', e.target.value)} />
          <div className="form-hint">Your estimated win rate for this trade</div>
        </div>

        <div className="section-divider" />
        <div className="section-label">Per Contract (per spread)</div>

        <div className="form-group">
          <label className="form-label">Max Profit per Contract ($)</label>
          <input className="form-input" type="number" placeholder="e.g. 300"
            onChange={e => num('profit', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Max Loss per Contract ($)</label>
          <input className="form-input" type="number" placeholder="e.g. 700"
            onChange={e => num('loss', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Premium / Cost per Contract ($)</label>
          <input className="form-input" type="number" placeholder="e.g. 700"
            onChange={e => num('cost', e.target.value)} />
          <div className="form-hint">Used to determine contract count from allocation</div>
        </div>

        {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 8 }}>{error}</div>}

        <button className="btn-analyze" onClick={handleCalc}>Calculate Position Size</button>
      </div>

      {/* ── Results Panel ── */}
      <div className="results-panel">
        {!result ? (
          <div className="empty-state">
            <div className="empty-icon">%</div>
            <div className="empty-title">No Analysis Yet</div>
            <div className="empty-subtitle">Enter your trade parameters to calculate optimal position sizing</div>
          </div>
        ) : (
          <>
            {/* Kelly Results */}
            <ResultCard title="Kelly Criterion Results">
              <div className="result-grid-3">
                <ResultItem
                  label="Full Kelly"
                  value={`${fmt(result.full.fraction * 100)}%`}
                  sub={`${result.full.contracts} contracts · ${fmtDollar(result.full.dollars)}`}
                  valueClass="text-red"
                />
                <div style={{ position: 'relative' }}>
                  <ResultItem
                    label="Half Kelly ★"
                    value={`${fmt(result.half.fraction * 100)}%`}
                    sub={`${result.half.contracts} contracts · ${fmtDollar(result.half.dollars)}`}
                    valueClass="text-green"
                    itemClass={result.half.riskPct <= 5 ? 'bg-green' : 'bg-yellow'}
                  />
                  <span className="star-badge" style={{ position: 'absolute', top: 14, right: 14 }}>★ REC</span>
                </div>
                <ResultItem
                  label="Quarter Kelly"
                  value={`${fmt(result.quarter.fraction * 100)}%`}
                  sub={`${result.quarter.contracts} contracts · ${fmtDollar(result.quarter.dollars)}`}
                  valueClass="text-blue"
                />
              </div>
            </ResultCard>

            {/* Risk Analysis */}
            <ResultCard title="Risk Analysis">
              <div className="result-grid-3">
                <ResultItem
                  label="Full Kelly Risk"
                  value={`${fmt(result.full.riskPct)}%`}
                  sub={fmtDollar(result.full.risk)}
                  valueClass={result.full.riskPct <= 5 ? 'text-green' : 'text-red'}
                />
                <ResultItem
                  label="Half Kelly Risk"
                  value={`${fmt(result.half.riskPct)}%`}
                  sub={fmtDollar(result.half.risk)}
                  valueClass={result.half.riskPct <= 5 ? 'text-green' : 'text-yellow'}
                />
                <ResultItem
                  label="Quarter Kelly Risk"
                  value={`${fmt(result.quarter.riskPct)}%`}
                  sub={fmtDollar(result.quarter.risk)}
                  valueClass="text-green"
                />
              </div>
              <div className="risk-meter" style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Half Kelly Risk Gauge
                </div>
                <div className="risk-meter-bar">
                  <div
                    className={`risk-meter-fill ${riskClass(result.half.riskPct)}`}
                    style={{ width: `${Math.min(result.half.riskPct * 10, 100)}%` }}
                  />
                </div>
              </div>
            </ResultCard>

            {/* Expected Value */}
            <ResultCard title="Trade Expected Value">
              <div className="result-grid-2">
                <ResultItem
                  label="Expected Value (per contract)"
                  value={`${result.expectedValue >= 0 ? '+' : ''}${fmtDollar(result.expectedValue)}`}
                  sub={result.expectedValue >= 0 ? 'Positive edge' : 'Negative edge'}
                  valueClass={result.expectedValue >= 0 ? 'text-green' : 'text-red'}
                />
                <ResultItem
                  label="Reward / Risk (b)"
                  value={`${fmt(result.b)}:1`}
                  sub={`POP: ${fmt(result.pop)}%`}
                  valueClass={result.b >= 1 ? 'text-green' : 'text-yellow'}
                />
              </div>
            </ResultCard>

            <InterpretationBox
              verdict={result.verdict}
              verdictLabel={result.verdictLabel}
              paragraphs={result.paragraphs}
            />
          </>
        )}
      </div>
    </div>
  );
}
