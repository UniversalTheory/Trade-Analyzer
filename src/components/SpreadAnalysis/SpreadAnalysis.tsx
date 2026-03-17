import { useState } from 'react';
import type { SpreadInputs, SpreadType } from '../../utils/types';
import { calcSpread } from '../../utils/spreadCalculations';
import ResultCard from '../common/ResultCard';
import ResultItem from '../common/ResultItem';
import InterpretationBox from '../common/InterpretationBox';

const LABELS: Record<string, { a: string; b: string; pA: string; pB: string }> = {
  'bull-call': { a: 'Long Call Strike', b: 'Short Call Strike', pA: 'Long Call Premium', pB: 'Short Call Premium' },
  'bear-put':  { a: 'Long Put Strike',  b: 'Short Put Strike',  pA: 'Long Put Premium',  pB: 'Short Put Premium'  },
  'bull-put':  { a: 'Short Put Strike', b: 'Long Put Strike',   pA: 'Short Put Premium', pB: 'Long Put Premium'   },
  'bear-call': { a: 'Short Call Strike',b: 'Long Call Strike',  pA: 'Short Call Premium',pB: 'Long Call Premium'  },
};

const fmt = (n: number) => n.toFixed(2);
const fmtDollar = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

function emptyInputs(): SpreadInputs {
  return {
    type: 'bull-call',
    stock: 0, strikeA: 0, strikeB: 0, premA: 0, premB: 0,
    icLongPut: 0, icShortPut: 0, icShortCall: 0, icLongCall: 0, icCredit: 0,
    contracts: 1, account: 0,
  };
}

export default function SpreadAnalysis() {
  const [inputs, setInputs] = useState<SpreadInputs>(emptyInputs());
  const [result, setResult] = useState<ReturnType<typeof calcSpread>>(null);
  const [error, setError] = useState('');

  const set = (field: keyof SpreadInputs, value: string | number) =>
    setInputs(prev => ({ ...prev, [field]: value }));

  const num = (field: keyof SpreadInputs, value: string) =>
    set(field, value === '' ? 0 : parseFloat(value));

  const handleAnalyze = () => {
    const r = calcSpread(inputs);
    if (!r) { setError('Please fill in all required fields.'); setResult(null); }
    else { setError(''); setResult(r); }
  };

  const isCondor = inputs.type === 'iron-condor';
  const labels = isCondor ? null : LABELS[inputs.type];

  const riskClass = (pct: number) =>
    pct <= 2 ? 'risk-low' : pct <= 5 ? 'risk-medium' : pct <= 10 ? 'risk-high' : 'risk-extreme';

  return (
    <div className="tab-panel active">
      {/* ── Input Panel ── */}
      <div className="input-panel">
        <div className="panel-title">Spread Parameters</div>

        <div className="form-group">
          <label className="form-label">Strategy Type</label>
          <select
            className="form-select"
            value={inputs.type}
            onChange={e => set('type', e.target.value as SpreadType)}
          >
            <option value="bull-call">Bull Call Spread (Debit)</option>
            <option value="bear-put">Bear Put Spread (Debit)</option>
            <option value="bull-put">Bull Put Spread (Credit)</option>
            <option value="bear-call">Bear Call Spread (Credit)</option>
            <option value="iron-condor">Iron Condor (Credit)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Current Stock Price</label>
          <input className="form-input" type="number" placeholder="e.g. 450.00"
            onChange={e => num('stock', e.target.value)} />
        </div>

        {!isCondor && labels && (
          <>
            <div className="section-divider" />
            <div className="section-label">Strike Prices</div>

            <div className="form-group">
              <label className="form-label">{labels.a}</label>
              <input className="form-input" type="number" placeholder="e.g. 445.00"
                onChange={e => num('strikeA', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">{labels.b}</label>
              <input className="form-input" type="number" placeholder="e.g. 455.00"
                onChange={e => num('strikeB', e.target.value)} />
            </div>

            <div className="section-divider" />
            <div className="section-label">Premiums (per share)</div>

            <div className="form-group">
              <label className="form-label">{labels.pA}</label>
              <input className="form-input" type="number" placeholder="e.g. 5.50"
                onChange={e => num('premA', e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">{labels.pB}</label>
              <input className="form-input" type="number" placeholder="e.g. 2.50"
                onChange={e => num('premB', e.target.value)} />
            </div>
          </>
        )}

        {isCondor && (
          <>
            <div className="section-divider" />
            <div className="section-label">Put Spread</div>

            <div className="form-group">
              <label className="form-label">Long Put Strike (OTM)</label>
              <input className="form-input" type="number" placeholder="e.g. 420.00"
                onChange={e => num('icLongPut', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Short Put Strike</label>
              <input className="form-input" type="number" placeholder="e.g. 430.00"
                onChange={e => num('icShortPut', e.target.value)} />
            </div>

            <div className="section-divider" />
            <div className="section-label">Call Spread</div>

            <div className="form-group">
              <label className="form-label">Short Call Strike</label>
              <input className="form-input" type="number" placeholder="e.g. 470.00"
                onChange={e => num('icShortCall', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Long Call Strike (OTM)</label>
              <input className="form-input" type="number" placeholder="e.g. 480.00"
                onChange={e => num('icLongCall', e.target.value)} />
            </div>

            <div className="section-divider" />
            <div className="section-label">Credit Received</div>

            <div className="form-group">
              <label className="form-label">Total Net Credit (per share)</label>
              <input className="form-input" type="number" placeholder="e.g. 2.50"
                onChange={e => num('icCredit', e.target.value)} />
            </div>
          </>
        )}

        <div className="section-divider" />

        <div className="form-group">
          <label className="form-label">Number of Contracts</label>
          <input className="form-input" type="number" defaultValue="1" min="1"
            onChange={e => num('contracts', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Account Size (optional)</label>
          <input className="form-input" type="number" placeholder="e.g. 50000"
            onChange={e => num('account', e.target.value)} />
          <div className="form-hint">Used to calculate position risk %</div>
        </div>

        {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 8 }}>{error}</div>}

        <button className="btn-analyze" onClick={handleAnalyze}>Analyze Spread</button>
      </div>

      {/* ── Results Panel ── */}
      <div className="results-panel">
        {!result ? (
          <div className="empty-state">
            <div className="empty-icon">⊿</div>
            <div className="empty-title">No Analysis Yet</div>
            <div className="empty-subtitle">Configure your spread parameters and click Analyze Spread</div>
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <ResultCard title="Key Metrics">
              <div className="result-grid">
                <ResultItem
                  label="Max Profit"
                  value={fmtDollar(result.maxProfit)}
                  sub={`${result.contracts} contract${result.contracts !== 1 ? 's' : ''}`}
                  valueClass="text-green"
                />
                <ResultItem
                  label="Max Loss"
                  value={fmtDollar(result.maxLoss)}
                  sub="at expiration"
                  valueClass="text-red"
                />
                <ResultItem
                  label="Reward/Risk"
                  value={`${fmt(result.rewardRisk)}:1`}
                  sub={result.rewardRisk >= 1 ? 'Favorable' : result.rewardRisk >= 0.5 ? 'Acceptable' : 'Unfavorable'}
                  valueClass={result.rewardRisk >= 1 ? 'text-green' : result.rewardRisk >= 0.5 ? 'text-yellow' : 'text-red'}
                />
                <ResultItem
                  label="Expected Value"
                  value={`${result.expectedValue >= 0 ? '+' : ''}${fmtDollar(result.expectedValue)}`}
                  sub="per trade avg"
                  valueClass={result.expectedValue >= 0 ? 'text-green' : 'text-red'}
                />
              </div>
            </ResultCard>

            {/* Breakevens & POP */}
            <ResultCard title="Breakevens & Probability">
              <div className="result-grid-3">
                <ResultItem
                  label={result.breakevens.length > 1 ? 'Lower Breakeven' : 'Breakeven'}
                  value={`$${fmt(result.breakevens[0])}`}
                  valueClass="text-cyan"
                />
                {result.breakevens.length > 1 && (
                  <ResultItem
                    label="Upper Breakeven"
                    value={`$${fmt(result.breakevens[1])}`}
                    valueClass="text-cyan"
                  />
                )}
                <ResultItem
                  label="Prob. of Profit"
                  value={`${fmt(result.pop)}%`}
                  sub="estimated"
                  valueClass={result.pop >= 60 ? 'text-green' : result.pop >= 45 ? 'text-yellow' : 'text-red'}
                />
                <ResultItem
                  label="Strategy"
                  value={result.name}
                  sub={result.isCredit ? 'Credit Spread' : 'Debit Spread'}
                  valueClass="text-purple"
                />
              </div>
            </ResultCard>

            {/* Account Risk */}
            {result.accountRisk !== null && (
              <ResultCard title="Capital at Risk">
                <div className="result-grid-2">
                  <ResultItem
                    label="Account Risk"
                    value={`${fmt(result.accountRisk)}%`}
                    sub={result.accountRisk <= 2 ? '✓ Within 2% guideline' : result.accountRisk <= 5 ? '⚠ Within 5% guideline' : '✗ Exceeds 5% guideline'}
                    valueClass={result.accountRisk <= 2 ? 'text-green' : result.accountRisk <= 5 ? 'text-yellow' : 'text-red'}
                  />
                  <ResultItem
                    label="Capital at Risk"
                    value={fmtDollar(result.maxLoss)}
                    sub={`of $${result.accountRisk <= 2 ? 'safe' : 'review'} position size`}
                    valueClass="text-orange"
                  />
                </div>
                <div className="risk-meter" style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Risk Gauge
                  </div>
                  <div className="risk-meter-bar">
                    <div
                      className={`risk-meter-fill ${riskClass(result.accountRisk)}`}
                      style={{ width: `${Math.min(result.accountRisk * 10, 100)}%` }}
                    />
                  </div>
                </div>
              </ResultCard>
            )}

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
