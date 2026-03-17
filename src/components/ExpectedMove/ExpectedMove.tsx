import { useState } from 'react';
import type { ExpectedMoveInputs } from '../../utils/types';
import { calcExpectedMove } from '../../utils/expectedMoveCalculations';
import ResultCard from '../common/ResultCard';
import ResultItem from '../common/ResultItem';
import InterpretationBox from '../common/InterpretationBox';

const fmt = (n: number) => n.toFixed(2);

function emptyInputs(): ExpectedMoveInputs {
  return { stock: 0, iv: 0, dte: 0, straddle: null };
}

export default function ExpectedMove() {
  const [inputs, setInputs] = useState<ExpectedMoveInputs>(emptyInputs());
  const [result, setResult] = useState<ReturnType<typeof calcExpectedMove>>(null);
  const [error, setError] = useState('');

  const num = (field: keyof ExpectedMoveInputs, value: string) =>
    setInputs(prev => ({
      ...prev,
      [field]: value === '' ? (field === 'straddle' ? null : 0) : parseFloat(value),
    }));

  const handleCalc = () => {
    const r = calcExpectedMove(inputs);
    if (!r) { setError('Please enter stock price, IV, and DTE.'); setResult(null); }
    else { setError(''); setResult(r); }
  };

  const ivColor = (iv: number) =>
    iv < 20 ? 'text-green' : iv < 35 ? 'text-blue' : iv < 50 ? 'text-yellow' : 'text-red';

  return (
    <div className="tab-panel active">
      {/* ── Input Panel ── */}
      <div className="input-panel">
        <div className="panel-title">Expected Move Inputs</div>

        <div className="form-group">
          <label className="form-label">Current Stock Price</label>
          <input className="form-input" type="number" placeholder="e.g. 450.00"
            onChange={e => num('stock', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Implied Volatility (%)</label>
          <input className="form-input" type="number" placeholder="e.g. 28.5"
            onChange={e => num('iv', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Days to Expiration</label>
          <input className="form-input" type="number" placeholder="e.g. 30"
            onChange={e => num('dte', e.target.value)} />
        </div>

        <div className="section-divider" />

        <div className="form-group">
          <label className="form-label">ATM Straddle Price (optional)</label>
          <input className="form-input" type="number" placeholder="e.g. 18.50"
            onChange={e => num('straddle', e.target.value)} />
          <div className="form-hint">If provided, calculates straddle-implied move</div>
        </div>

        {error && <div style={{ color: 'var(--accent-red)', fontSize: 13, marginTop: 8 }}>{error}</div>}

        <button className="btn-analyze" onClick={handleCalc}>Calculate Expected Move</button>
      </div>

      {/* ── Results Panel ── */}
      <div className="results-panel">
        {!result ? (
          <div className="empty-state">
            <div className="empty-icon">↔</div>
            <div className="empty-title">No Analysis Yet</div>
            <div className="empty-subtitle">Enter stock price, IV, and DTE to calculate the expected move</div>
          </div>
        ) : (
          <>
            {/* IV-Based Expected Move */}
            <ResultCard title="IV-Based Expected Move">
              <div className="result-grid">
                <ResultItem
                  label="1 Std Dev Move"
                  value={`±$${fmt(result.em1sd)}`}
                  sub={`±${fmt((result.em1sd / result.stock) * 100)}%`}
                  valueClass="text-blue"
                />
                <ResultItem
                  label="Lower Bound (1SD)"
                  value={`$${fmt(result.stock - result.em1sd)}`}
                  sub="~68% probability"
                  valueClass="text-green"
                />
                <ResultItem
                  label="Upper Bound (1SD)"
                  value={`$${fmt(result.stock + result.em1sd)}`}
                  sub="~68% probability"
                  valueClass="text-green"
                />
                <ResultItem
                  label="Implied Volatility"
                  value={`${fmt(result.iv)}%`}
                  sub={result.iv < 20 ? 'Low' : result.iv < 35 ? 'Moderate' : result.iv < 50 ? 'Elevated' : 'Very High'}
                  valueClass={ivColor(result.iv)}
                />
              </div>
            </ResultCard>

            {/* 2SD Range */}
            <ResultCard title="2 Std Dev Range (95%)">
              <div className="result-grid-3">
                <ResultItem
                  label="2 Std Dev Move"
                  value={`±$${fmt(result.em2sd)}`}
                  sub={`±${fmt((result.em2sd / result.stock) * 100)}%`}
                  valueClass="text-purple"
                />
                <ResultItem
                  label="Lower Bound (2SD)"
                  value={`$${fmt(result.stock - result.em2sd)}`}
                  sub="~95% probability"
                  valueClass="text-yellow"
                />
                <ResultItem
                  label="Upper Bound (2SD)"
                  value={`$${fmt(result.stock + result.em2sd)}`}
                  sub="~95% probability"
                  valueClass="text-yellow"
                />
              </div>
            </ResultCard>

            {/* Daily Move */}
            <ResultCard title="Daily Expected Move">
              <div className="result-grid-2">
                <ResultItem
                  label="Daily 1SD Move"
                  value={`±$${fmt(result.emDaily)}`}
                  sub={`±${fmt((result.emDaily / result.stock) * 100)}% per day`}
                  valueClass="text-cyan"
                />
                <ResultItem
                  label="DTE"
                  value={`${result.dte}d`}
                  sub={`${Math.round(result.dte / 7)} week${Math.round(result.dte / 7) !== 1 ? 's' : ''} to expiry`}
                  valueClass="text-secondary"
                />
              </div>
            </ResultCard>

            {/* Straddle */}
            {result.emStraddle !== null && (
              <ResultCard title="Straddle-Implied Move">
                <div className="result-grid-2">
                  <ResultItem
                    label="Straddle Implied Move"
                    value={`±$${fmt(result.emStraddle)}`}
                    sub="straddle × 0.85"
                    valueClass="text-orange"
                  />
                  <ResultItem
                    label="vs IV Model"
                    value={`${result.emStraddle > result.em1sd ? '+' : ''}${fmt(((result.emStraddle / result.em1sd) - 1) * 100)}%`}
                    sub={result.emStraddle > result.em1sd ? 'Straddle implies larger move' : 'Straddle implies smaller move'}
                    valueClass={result.emStraddle > result.em1sd ? 'text-yellow' : 'text-green'}
                  />
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
