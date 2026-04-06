import { useState, useEffect } from 'react';
import { calcBlackScholes } from '../../utils/blackScholes';
import type { BlackScholesInputs, BlackScholesResult as BSResult } from '../../utils/types';
import ResultCard from '../common/ResultCard';
import ResultItem from '../common/ResultItem';
import InterpretationBox from '../common/InterpretationBox';
import GreeksDisplay from './GreeksDisplay';
import type { CalcPrefill } from '../Ticker/TickerResearch';

const initialInputs: BlackScholesInputs = {
  stockPrice: '',
  strikePrice: '',
  daysToExpiry: '',
  riskFreeRate: '4.5',
  volatility: '',
  optionType: 'call',
};

interface Props {
  prefill?: CalcPrefill | null;
  onPrefillConsumed?: () => void;
}

function buildResult(inputs: BlackScholesInputs): BSResult | null {
  const S = parseFloat(inputs.stockPrice);
  const K = parseFloat(inputs.strikePrice);
  const dte = parseFloat(inputs.daysToExpiry);
  const r = parseFloat(inputs.riskFreeRate) / 100;
  const sigma = parseFloat(inputs.volatility) / 100;

  if ([S, K, dte, r, sigma].some(v => isNaN(v) || v <= 0)) return null;

  const T = dte / 365;
  const result = calcBlackScholes({ stockPrice: S, strikePrice: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, optionType: inputs.optionType });
  if (!result) return null;

  const { delta, gamma, theta, vega } = result.greeks;
  const otm = inputs.optionType === 'call' ? S < K : S > K;
  const itm = inputs.optionType === 'call' ? S > K : S < K;
  const ivClass = sigma < 0.2 ? 'low' : sigma < 0.35 ? 'moderate' : sigma < 0.5 ? 'elevated' : 'very high';

  const paragraphs: string[] = [
    `This [${inputs.optionType}] option on a $${S.toFixed(2)} stock with a [blue]$${K.toFixed(2)} strike[/blue] and [blue]${dte} DTE[/blue] is priced at [green]$${result.price.toFixed(4)}[/green] per share ([blue]$${(result.price * 100).toFixed(2)} per contract[/blue]). The intrinsic value is $${result.intrinsicValue.toFixed(4)} and time value is $${result.timeValue.toFixed(4)}.`,
    `The option is currently [${itm ? 'green' : otm ? 'red' : 'yellow'}]${itm ? 'in-the-money (ITM)' : otm ? 'out-of-the-money (OTM)' : 'at-the-money (ATM)'}[/${itm ? 'green' : otm ? 'red' : 'yellow'}]. Implied volatility of [blue]${(sigma * 100).toFixed(1)}%[/blue] is ${ivClass}. For every $1 move in the stock, this option will gain or lose approximately [${delta >= 0 ? 'green' : 'red'}]$${Math.abs(delta).toFixed(4)}[/${delta >= 0 ? 'green' : 'red'}] (delta).`,
    `Theta decay is [red]$${Math.abs(theta).toFixed(4)}/day[/red] — the option loses this amount of time value each calendar day all else being equal. Vega is [yellow]$${vega.toFixed(4)}[/yellow] per 1% IV change. Gamma of ${gamma.toFixed(6)} tells you how fast delta changes as the stock moves.`,
  ];

  return {
    ...result,
    verdict: 'info',
    verdictLabel: itm ? 'In The Money' : otm ? 'Out of The Money' : 'At The Money',
    paragraphs,
  };
}

export default function BlackScholes({ prefill, onPrefillConsumed }: Props) {
  const [inputs, setInputs] = useState<BlackScholesInputs>(initialInputs);
  const [result, setResult] = useState<BSResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!prefill) return;
    setInputs(prev => ({
      ...prev,
      stockPrice: prefill.stockPrice,
      volatility: prefill.volatility,
      strikePrice: '',
      daysToExpiry: '',
    }));
    setResult(null);
    setError('');
    onPrefillConsumed?.();
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setInputs(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleAnalyze() {
    setError('');
    const r = buildResult(inputs);
    if (!r) {
      setError('Please fill in all fields with valid positive values.');
      return;
    }
    setResult(r);
  }

  return (
    <div className="tab-layout">
      <div className="input-panel">
        <div className="panel-title">Black-Scholes Pricing</div>

        <div className="form-group">
          <label className="form-label">Option Type</label>
          <div className="toggle-group">
            {(['call', 'put'] as const).map(t => (
              <button
                key={t}
                className={`toggle-btn ${inputs.optionType === t ? 'active' : ''}`}
                onClick={() => setInputs(prev => ({ ...prev, optionType: t }))}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Stock Price (S)</label>
          <div className="input-wrapper">
            <span className="input-prefix">$</span>
            <input
              className="form-input with-prefix"
              type="number"
              name="stockPrice"
              value={inputs.stockPrice}
              onChange={handleChange}
              placeholder="e.g. 250.00"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Strike Price (K)</label>
          <div className="input-wrapper">
            <span className="input-prefix">$</span>
            <input
              className="form-input with-prefix"
              type="number"
              name="strikePrice"
              value={inputs.strikePrice}
              onChange={handleChange}
              placeholder="e.g. 260.00"
              min="0"
              step="0.5"
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Days to Expiry (DTE)</label>
          <input
            className="form-input"
            type="number"
            name="daysToExpiry"
            value={inputs.daysToExpiry}
            onChange={handleChange}
            placeholder="e.g. 30"
            min="1"
          />
        </div>

        <div className="form-group">
          <label className="form-label">Implied Volatility (%)</label>
          <div className="input-wrapper">
            <input
              className="form-input with-suffix"
              type="number"
              name="volatility"
              value={inputs.volatility}
              onChange={handleChange}
              placeholder="e.g. 30"
              min="0"
              step="0.5"
            />
            <span className="input-suffix">%</span>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Risk-Free Rate (%)</label>
          <div className="input-wrapper">
            <input
              className="form-input with-suffix"
              type="number"
              name="riskFreeRate"
              value={inputs.riskFreeRate}
              onChange={handleChange}
              placeholder="4.5"
              min="0"
              step="0.1"
            />
            <span className="input-suffix">%</span>
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}
        <button className="btn-analyze" onClick={handleAnalyze}>Calculate</button>
      </div>

      <div className="results-panel">
        {!result ? (
          <div className="empty-state">
            <div className="empty-icon">∫</div>
            <div className="empty-title">Black-Scholes Pricing</div>
            <div className="empty-desc">Enter option parameters to calculate the theoretical price and all Greeks using the Black-Scholes model.</div>
          </div>
        ) : (
          <>
            <ResultCard title="Option Price">
              <ResultItem
                label="Theoretical Price"
                value={`$${result.price.toFixed(4)}`}
                sub={`$${(result.price * 100).toFixed(2)} / contract`}
                valueClass="text-green"
              />
              <ResultItem label="Intrinsic Value" value={`$${result.intrinsicValue.toFixed(4)}`} />
              <ResultItem label="Time Value" value={`$${result.timeValue.toFixed(4)}`} valueClass="text-yellow" />
              <ResultItem
                label="Moneyness"
                value={result.verdictLabel}
                valueClass={result.verdictLabel === 'In The Money' ? 'text-green' : result.verdictLabel === 'Out of The Money' ? 'text-red' : 'text-yellow'}
              />
            </ResultCard>

            <ResultCard title="Greeks (Δ Γ Θ V ρ)">
              <GreeksDisplay greeks={result.greeks} optionType={inputs.optionType} />
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
