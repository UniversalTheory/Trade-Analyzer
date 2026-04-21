import { useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Line, ComposedChart,
} from 'recharts';
import { ticker } from '../../api/client';
import ResultCard from '../common/ResultCard';
import ResultItem from '../common/ResultItem';
import {
  STRATEGIES, payoffVector, supportsMonteCarloPayoff, profileFromPayoff,
  type StrategyId, type StrategyLegs,
} from '../../utils/strategyPayoff';
import { simulatePricePaths, computeLogReturns, annualisedVol } from '../../utils/monteCarlo';
import {
  analyzeDistribution, tradeVerdict, riskRewardRatio,
  type DistributionAnalysis, type Verdict,
} from '../../utils/simulationAnalysis';

// ── Leg-field specification per strategy ─────────────────────────────────────

type LegField =
  | 'longCallStrike' | 'longCallPremium'
  | 'shortCallStrike' | 'shortCallPremium'
  | 'longPutStrike' | 'longPutPremium'
  | 'shortPutStrike' | 'shortPutPremium'
  | 'stockBasis';

interface LegSpec {
  key: LegField;
  label: string;
  prefix?: string;
  placeholder?: string;
}

const STRATEGY_LEGS: Record<StrategyId, LegSpec[]> = {
  'Long Call':          [{ key: 'longCallStrike',  label: 'Call Strike',  prefix: '$' }, { key: 'longCallPremium',  label: 'Call Premium',  prefix: '$' }],
  'Long Put':           [{ key: 'longPutStrike',   label: 'Put Strike',   prefix: '$' }, { key: 'longPutPremium',   label: 'Put Premium',   prefix: '$' }],
  'Bull Call Spread':   [{ key: 'longCallStrike',  label: 'Long Call Strike', prefix: '$' }, { key: 'longCallPremium', label: 'Long Call Premium', prefix: '$' }, { key: 'shortCallStrike', label: 'Short Call Strike', prefix: '$' }, { key: 'shortCallPremium', label: 'Short Call Premium', prefix: '$' }],
  'Bear Put Spread':    [{ key: 'longPutStrike',   label: 'Long Put Strike',  prefix: '$' }, { key: 'longPutPremium',  label: 'Long Put Premium',  prefix: '$' }, { key: 'shortPutStrike',  label: 'Short Put Strike',  prefix: '$' }, { key: 'shortPutPremium',  label: 'Short Put Premium',  prefix: '$' }],
  'Put Credit Spread':  [{ key: 'shortPutStrike',  label: 'Short Put (higher) Strike', prefix: '$' }, { key: 'shortPutPremium', label: 'Short Put Premium', prefix: '$' }, { key: 'longPutStrike', label: 'Long Put (lower) Strike', prefix: '$' }, { key: 'longPutPremium', label: 'Long Put Premium', prefix: '$' }],
  'Bear Call Spread':   [{ key: 'shortCallStrike', label: 'Short Call (lower) Strike', prefix: '$' }, { key: 'shortCallPremium', label: 'Short Call Premium', prefix: '$' }, { key: 'longCallStrike', label: 'Long Call (higher) Strike', prefix: '$' }, { key: 'longCallPremium', label: 'Long Call Premium', prefix: '$' }],
  'Cash-Secured Put':   [{ key: 'shortPutStrike',  label: 'Put Strike',  prefix: '$' }, { key: 'shortPutPremium',  label: 'Premium Received', prefix: '$' }],
  'Covered Call':       [{ key: 'stockBasis',      label: 'Stock Basis', prefix: '$' }, { key: 'shortCallStrike', label: 'Call Strike', prefix: '$' }, { key: 'shortCallPremium', label: 'Premium Received', prefix: '$' }],
  'Protective Put':     [{ key: 'stockBasis',      label: 'Stock Basis', prefix: '$' }, { key: 'longPutStrike',   label: 'Put Strike',  prefix: '$' }, { key: 'longPutPremium',  label: 'Put Premium',  prefix: '$' }],
  'Collar':             [{ key: 'stockBasis',      label: 'Stock Basis', prefix: '$' }, { key: 'longPutStrike',   label: 'Long Put Strike', prefix: '$' }, { key: 'longPutPremium', label: 'Long Put Premium', prefix: '$' }, { key: 'shortCallStrike', label: 'Short Call Strike', prefix: '$' }, { key: 'shortCallPremium', label: 'Short Call Premium', prefix: '$' }],
  'Iron Condor':        [{ key: 'longPutStrike',   label: 'Long Put (low) Strike', prefix: '$' }, { key: 'longPutPremium', label: 'Long Put Premium', prefix: '$' }, { key: 'shortPutStrike', label: 'Short Put Strike', prefix: '$' }, { key: 'shortPutPremium', label: 'Short Put Premium', prefix: '$' }, { key: 'shortCallStrike', label: 'Short Call Strike', prefix: '$' }, { key: 'shortCallPremium', label: 'Short Call Premium', prefix: '$' }, { key: 'longCallStrike', label: 'Long Call (high) Strike', prefix: '$' }, { key: 'longCallPremium', label: 'Long Call Premium', prefix: '$' }],
  'Straddle / Strangle':[{ key: 'longCallStrike',  label: 'Call Strike', prefix: '$' }, { key: 'longCallPremium', label: 'Call Premium', prefix: '$' }, { key: 'longPutStrike', label: 'Put Strike', prefix: '$' }, { key: 'longPutPremium', label: 'Put Premium', prefix: '$' }],
  'Calendar Spread':    [],
};

type LegInputs = Partial<Record<LegField, string>>;
type VolModel = 'gbm' | 'bootstrap';
type PathChoice = 2000 | 5000 | 10000 | 25000 | 50000;

const PATH_CHOICES: PathChoice[] = [2000, 5000, 10000, 25000, 50000];

// ── Result payload ───────────────────────────────────────────────────────────

interface SimResult {
  analysis: DistributionAnalysis;
  verdict: Verdict;
  rr: number;
  maxGainPerShare: number | null;
  maxLossPerShare: number | null;
  breakevens: number[];
  terminalPrices: Float64Array;
  pnlPerShare: Float64Array;
  fanChart: FanPoint[];
  histogram: HistoBin[];
  elapsedMs: number;
  paths: number;
  steps: number;
  spot: number;
  contractMult: number;       // always 100
  strategy: StrategyId;
  volSource: string;          // e.g. "GBM σ=28%" or "Bootstrap (252 returns)"
}

interface FanPoint {
  day: number;       // 0..steps
  median: number;
  p25: number;
  p75: number;
  p5: number;
  p95: number;
}

interface HistoBin {
  pl: number;        // bin centre, per-contract P/L
  count: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNum(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function legsFromInputs(strategy: StrategyId, li: LegInputs): StrategyLegs {
  const out: StrategyLegs = {};
  for (const spec of STRATEGY_LEGS[strategy]) {
    const n = parseNum(li[spec.key]);
    if (n != null) (out as any)[spec.key] = n;
  }
  return out;
}

function computeFanChart(paths: Float64Array, nPaths: number, steps: number): FanPoint[] {
  const cols = steps + 1;
  // Downsample to <= 60 points for smooth rendering without huge DOM cost.
  const stride = Math.max(1, Math.floor(cols / 60));
  const sampleCols: number[] = [];
  for (let s = 0; s < cols; s += stride) sampleCols.push(s);
  if (sampleCols[sampleCols.length - 1] !== cols - 1) sampleCols.push(cols - 1);

  const column = new Float64Array(nPaths);
  const pct = (idx: number) => column[Math.min(nPaths - 1, Math.max(0, Math.floor(idx * (nPaths - 1))))];

  const out: FanPoint[] = [];
  for (const s of sampleCols) {
    for (let p = 0; p < nPaths; p++) column[p] = paths[p * cols + s];
    column.sort();
    out.push({
      day: s,
      p5: pct(0.05),
      p25: pct(0.25),
      median: pct(0.50),
      p75: pct(0.75),
      p95: pct(0.95),
    });
  }
  return out;
}

function computeHistogram(pnlPerContract: Float64Array, bins = 40): HistoBin[] {
  const n = pnlPerContract.length;
  if (n === 0) return [];
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = pnlPerContract[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) { min -= 1; max += 1; }
  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);
  for (let i = 0; i < n; i++) {
    let idx = Math.floor((pnlPerContract[i] - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    counts[idx]++;
  }
  const out: HistoBin[] = [];
  for (let i = 0; i < bins; i++) {
    out.push({ pl: min + (i + 0.5) * width, count: counts[i] });
  }
  return out;
}

function findNearestExpiry(expirations: string[], targetDays: number): string | null {
  if (!expirations.length) return null;
  const today = Date.now();
  let best = expirations[0];
  let bestDelta = Infinity;
  for (const e of expirations) {
    const days = (new Date(e).getTime() - today) / (1000 * 60 * 60 * 24);
    const d = Math.abs(days - targetDays);
    if (d < bestDelta) { bestDelta = d; best = e; }
  }
  return best;
}

function fmt$(n: number, decimals = 0): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtPct(x: number, decimals = 1): string {
  return `${(x * 100).toFixed(decimals)}%`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function MonteCarloSimulation() {
  const [strategy, setStrategy] = useState<StrategyId>('Long Call');
  const [symbol, setSymbol] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const [spot, setSpot] = useState('');
  const [dte, setDte] = useState('30');
  const [legInputs, setLegInputs] = useState<LegInputs>({});
  const [volModel, setVolModel] = useState<VolModel>('gbm');
  const [volAnnual, setVolAnnual] = useState('');     // percentage string, e.g. "28"
  const [driftAnnual, setDriftAnnual] = useState('0');// percentage string
  const [pathCount, setPathCount] = useState<PathChoice>(10000);
  const [histReturns, setHistReturns] = useState<number[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SimResult | null>(null);

  const legSpecs = STRATEGY_LEGS[strategy];
  const mcSupported = supportsMonteCarloPayoff(strategy);

  function updateLeg(key: LegField, val: string) {
    setLegInputs(prev => ({ ...prev, [key]: val }));
  }

  function handleStrategyChange(next: StrategyId) {
    setStrategy(next);
    setLegInputs({});
    setResult(null);
    setError('');
  }

  async function handleFetchLive() {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;
    setFetching(true);
    setFetchMsg('');
    setError('');
    try {
      const [quote, history, chain] = await Promise.all([
        ticker.getQuote(sym),
        ticker.getHistory(sym, '1y'),
        ticker.getOptions(sym).catch(() => null),
      ]);

      setSpot(quote.price.toFixed(2));

      const closes = history.map(b => b.close).filter(c => c > 0);
      const logReturns = computeLogReturns(closes);
      const hv = annualisedVol(logReturns);
      setHistReturns(logReturns);

      // Try to use ATM IV from options chain closest to target DTE
      let iv: number | null = null;
      if (chain) {
        const targetDte = parseNum(dte) ?? 30;
        // The /options endpoint already returned a single expiration; use it.
        // If expiration is missing, fall back to HV.
        const all = [...chain.calls, ...chain.puts].filter(c => c.impliedVolatility > 0);
        if (all.length > 0) {
          const atm = all.reduce((best, c) =>
            Math.abs(c.strike - quote.price) < Math.abs(best.strike - quote.price) ? c : best
          );
          iv = atm.impliedVolatility;
        }
        void findNearestExpiry; // (reserved for multi-expiry chain extensions)
        void targetDte;
      }

      const volToUse = iv ?? hv;
      if (volToUse > 0) setVolAnnual((volToUse * 100).toFixed(2));

      setFetchMsg(
        `Loaded ${sym}: spot ${fmt$(quote.price, 2)}, ` +
        `${iv ? `ATM IV ${(iv * 100).toFixed(1)}%` : `HV ${(hv * 100).toFixed(1)}%`}, ` +
        `${logReturns.length} daily returns for bootstrap`
      );
    } catch (e: any) {
      setError(`Failed to fetch ${sym}: ${e?.message ?? 'unknown error'}`);
    } finally {
      setFetching(false);
    }
  }

  function handleRun() {
    setError('');
    setResult(null);
    if (!mcSupported) {
      setError('Calendar Spread payoff at expiry requires Black-Scholes re-pricing and is not supported in MC v1.');
      return;
    }

    const S0 = parseNum(spot);
    const dteNum = parseNum(dte);
    if (!S0 || S0 <= 0) { setError('Enter a valid spot price.'); return; }
    if (!dteNum || dteNum <= 0) { setError('Enter a valid DTE.'); return; }

    // Validate leg inputs
    for (const spec of legSpecs) {
      const v = parseNum(legInputs[spec.key]);
      if (v == null) { setError(`Enter a value for "${spec.label}".`); return; }
      if (spec.key.endsWith('Strike') || spec.key.endsWith('Premium') || spec.key === 'stockBasis') {
        if (v < 0) { setError(`"${spec.label}" cannot be negative.`); return; }
      }
    }

    const legs = legsFromInputs(strategy, legInputs);
    const T = dteNum / 365;
    const steps = Math.max(1, Math.min(252, Math.round(dteNum))); // 1 step per calendar day, capped at 252
    const paths = pathCount;

    const driftDec = (parseNum(driftAnnual) ?? 0) / 100;

    let volDec: number | undefined;
    let returns: number[] | undefined;
    if (volModel === 'gbm') {
      const vPct = parseNum(volAnnual);
      if (!vPct || vPct <= 0) { setError('Enter a valid annualised volatility (> 0).'); return; }
      volDec = vPct / 100;
    } else {
      if (!histReturns || histReturns.length < 20) {
        setError('Bootstrap requires historical returns. Fetch live data for a symbol first.');
        return;
      }
      returns = histReturns;
    }

    setRunning(true);
    // Run in a microtask to let the UI update the button state first
    setTimeout(() => {
      try {
        const mc = simulatePricePaths({
          model: volModel,
          S0,
          T,
          steps,
          paths,
          driftAnnual: driftDec,
          volAnnual: volDec,
          histReturns: returns,
          seed: 0xC0FFEE,  // fixed seed for reproducibility within the session
        });

        const pnlShare = payoffVector(strategy, legs, mc.terminalPrices);
        // Per-contract P/L for display (× 100)
        const pnlContract = new Float64Array(pnlShare.length);
        for (let i = 0; i < pnlShare.length; i++) pnlContract[i] = pnlShare[i] * 100;

        const analysis = analyzeDistribution(pnlContract);
        const profile = profileFromPayoff(strategy, legs, S0);
        const rr = riskRewardRatio(analysis);
        const verdict = tradeVerdict({ pop: analysis.pop, ev: analysis.meanPnl, rrRatio: rr });

        const fanChart = computeFanChart(mc.paths, mc.nPaths, mc.nSteps);
        const histogram = computeHistogram(pnlContract, 40);

        const volLabel = volModel === 'gbm'
          ? `GBM σ=${((volDec ?? 0) * 100).toFixed(1)}% drift=${(driftDec * 100).toFixed(1)}%`
          : `Bootstrap (${returns!.length} daily returns)`;

        setResult({
          analysis,
          verdict,
          rr,
          maxGainPerShare: profile.maxGainPerShare,
          maxLossPerShare: profile.maxLossPerShare,
          breakevens: profile.breakevens,
          terminalPrices: mc.terminalPrices,
          pnlPerShare: pnlShare,
          fanChart,
          histogram,
          elapsedMs: mc.elapsedMs,
          paths: mc.nPaths,
          steps: mc.nSteps,
          spot: S0,
          contractMult: 100,
          strategy,
          volSource: volLabel,
        });
      } catch (e: any) {
        setError(e?.message ?? 'Simulation failed.');
      } finally {
        setRunning(false);
      }
    }, 30);
  }

  return (
    <div className="tab-layout">
      <div className="input-panel">
        <div className="panel-title">Monte Carlo Simulation</div>

        <div className="form-group">
          <label className="form-label">Strategy</label>
          <select
            className="form-input"
            value={strategy}
            onChange={(e) => handleStrategyChange(e.target.value as StrategyId)}
          >
            {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {!mcSupported && (
            <div className="form-hint form-hint-warn">
              Calendar Spread payoff at expiry requires BS re-pricing — not available in v1.
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Symbol (optional)</label>
          <div className="mc-symbol-row">
            <input
              className="form-input"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="AAPL"
              maxLength={8}
            />
            <button
              type="button"
              className="btn-fetch"
              disabled={fetching || !symbol.trim()}
              onClick={handleFetchLive}
            >
              {fetching ? 'Fetching…' : 'Fetch Live'}
            </button>
          </div>
          {fetchMsg && <div className="form-hint form-hint-ok">{fetchMsg}</div>}
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Spot (S₀)</label>
            <div className="input-wrapper">
              <span className="input-prefix">$</span>
              <input
                className="form-input with-prefix"
                type="number"
                value={spot}
                onChange={(e) => setSpot(e.target.value)}
                placeholder="e.g. 250.00"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">DTE (days)</label>
            <input
              className="form-input"
              type="number"
              value={dte}
              onChange={(e) => setDte(e.target.value)}
              placeholder="30"
              min="1"
              step="1"
            />
          </div>
        </div>

        {legSpecs.length > 0 && (
          <div className="mc-legs-grid">
            {legSpecs.map(spec => (
              <div key={spec.key} className="form-group">
                <label className="form-label">{spec.label}</label>
                <div className="input-wrapper">
                  {spec.prefix && <span className="input-prefix">{spec.prefix}</span>}
                  <input
                    className={`form-input ${spec.prefix ? 'with-prefix' : ''}`}
                    type="number"
                    value={legInputs[spec.key] ?? ''}
                    onChange={(e) => updateLeg(spec.key, e.target.value)}
                    placeholder={spec.placeholder ?? '0.00'}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Volatility Model</label>
          <div className="toggle-group">
            <button
              type="button"
              className={`toggle-btn ${volModel === 'gbm' ? 'active' : ''}`}
              onClick={() => setVolModel('gbm')}
            >
              GBM
            </button>
            <button
              type="button"
              className={`toggle-btn ${volModel === 'bootstrap' ? 'active' : ''}`}
              onClick={() => setVolModel('bootstrap')}
              disabled={!histReturns}
              title={!histReturns ? 'Fetch live data first to enable bootstrap' : ''}
            >
              Bootstrap {histReturns ? `(${histReturns.length})` : ''}
            </button>
          </div>
        </div>

        {volModel === 'gbm' && (
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Annualised Vol (σ)</label>
              <div className="input-wrapper">
                <input
                  className="form-input with-suffix"
                  type="number"
                  value={volAnnual}
                  onChange={(e) => setVolAnnual(e.target.value)}
                  placeholder="28"
                  min="0"
                  step="0.5"
                />
                <span className="input-suffix">%</span>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Drift (μ)</label>
              <div className="input-wrapper">
                <input
                  className="form-input with-suffix"
                  type="number"
                  value={driftAnnual}
                  onChange={(e) => setDriftAnnual(e.target.value)}
                  placeholder="0"
                  step="0.5"
                />
                <span className="input-suffix">%</span>
              </div>
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Paths</label>
          <div className="toggle-group toggle-group-compact">
            {PATH_CHOICES.map(n => (
              <button
                key={n}
                type="button"
                className={`toggle-btn ${pathCount === n ? 'active' : ''}`}
                onClick={() => setPathCount(n)}
              >
                {n >= 1000 ? `${n / 1000}K` : n}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <button
          className="btn-analyze"
          onClick={handleRun}
          disabled={running || !mcSupported}
        >
          {running ? 'Running simulation…' : 'Run Simulation'}
        </button>
      </div>

      <div className="results-panel">
        {!result ? (
          <div className="empty-state">
            <div className="empty-icon">◬</div>
            <div className="empty-title">Monte Carlo Simulation</div>
            <div className="empty-desc">
              Pick a strategy, enter leg details (or fetch a live symbol), choose a volatility model,
              and run {pathCount.toLocaleString()} price-path simulations to see the full P/L distribution,
              probability of profit, VaR, and a go/no-go verdict.
            </div>
          </div>
        ) : (
          <ResultsPane result={result} />
        )}
      </div>
    </div>
  );
}

// ── Results pane ─────────────────────────────────────────────────────────────

function ResultsPane({ result }: { result: SimResult }) {
  const {
    analysis, verdict, rr, maxGainPerShare, maxLossPerShare, breakevens,
    fanChart, histogram, elapsedMs, paths, steps, spot, strategy, volSource,
  } = result;

  const mult = result.contractMult;
  const verdictClass = useMemo(() => {
    switch (verdict.level) {
      case 'Strong': return 'verdict-strong';
      case 'OK':     return 'verdict-ok';
      case 'Weak':   return 'verdict-weak';
      case 'Avoid':  return 'verdict-avoid';
    }
  }, [verdict.level]);

  const maxGainStr = maxGainPerShare == null ? 'Unlimited' : fmt$(maxGainPerShare * mult, 0);
  const maxLossStr = maxLossPerShare == null ? 'Unlimited' : fmt$(maxLossPerShare * mult, 0);
  const rrStr = rr === Infinity ? '∞' : rr.toFixed(2);

  return (
    <>
      <ResultCard title={`Verdict · ${strategy}`}>
        <div className={`mc-verdict ${verdictClass}`}>
          <div className="mc-verdict-level">{verdict.level}</div>
          <div className="mc-verdict-rationale">{verdict.rationale}</div>
        </div>
        <div className="mc-meta">
          <span>{paths.toLocaleString()} paths × {steps} steps</span>
          <span>{volSource}</span>
          <span>{elapsedMs.toFixed(0)} ms</span>
        </div>
      </ResultCard>

      <ResultCard title="Key Metrics (per contract)">
        <ResultItem
          label="Probability of Profit"
          value={fmtPct(analysis.pop)}
          sub={`± ${fmtPct(analysis.stdErrOfPop)} (1σ)`}
          valueClass={analysis.pop >= 0.5 ? 'text-green' : 'text-red'}
        />
        <ResultItem
          label="Expected P/L"
          value={fmt$(analysis.meanPnl, 0)}
          valueClass={analysis.meanPnl >= 0 ? 'text-green' : 'text-red'}
        />
        <ResultItem label="Median P/L" value={fmt$(analysis.medianPnl, 0)} />
        <ResultItem label="VaR (95%)" value={fmt$(analysis.var95, 0)} valueClass="text-red" />
        <ResultItem label="CVaR (95%)" value={fmt$(analysis.cvar95, 0)} valueClass="text-red" />
        <ResultItem label="Max Gain" value={maxGainStr} valueClass="text-green" />
        <ResultItem label="Max Loss" value={maxLossStr} valueClass="text-red" />
        <ResultItem label="Risk/Reward" value={rrStr} />
        <ResultItem
          label="Breakeven(s)"
          value={breakevens.length ? breakevens.map(b => `$${b.toFixed(2)}`).join(' / ') : '—'}
        />
      </ResultCard>

      <ResultCard title="Terminal P/L Distribution">
        <div className="mc-chart">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={histogram} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="mcHistoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="pl"
                tickFormatter={(v) => fmt$(Number(v), 0)}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border)', fontSize: 12 }}
                labelFormatter={(v) => `P/L bucket: ${fmt$(Number(v), 0)}`}
                formatter={(v: any) => [`${v} paths`, 'Count']}
              />
              <ReferenceLine x={0} stroke="rgba(255,255,255,0.35)" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="count" stroke="#38bdf8" strokeWidth={2} fill="url(#mcHistoGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ResultCard>

      <ResultCard title="Price-Path Fan Chart (5/25/50/75/95 percentiles)">
        <div className="mc-chart">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={fanChart} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="fanOuterGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.04} />
                </linearGradient>
                <linearGradient id="fanInnerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="day"
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border)' }}
                tickLine={false}
                label={{ value: 'Days forward', fill: 'var(--text-muted)', fontSize: 11, position: 'insideBottom', offset: -2 }}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={55}
                tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{ background: 'var(--panel-bg)', border: '1px solid var(--border)', fontSize: 12 }}
                labelFormatter={(v) => `Day ${v}`}
                formatter={(val: any, name: any) => [`$${Number(val).toFixed(2)}`, name]}
              />
              <ReferenceLine y={spot} stroke="var(--color-blue)" strokeDasharray="4 4" strokeWidth={1.25} label={{ value: 'Spot', fill: 'var(--color-blue)', fontSize: 10, position: 'right' }} />
              <Area type="monotone" dataKey="p95" stroke="none" fill="url(#fanOuterGrad)" name="p95" />
              <Area type="monotone" dataKey="p5"  stroke="none" fill="url(#fanOuterGrad)" name="p5"  />
              <Area type="monotone" dataKey="p75" stroke="none" fill="url(#fanInnerGrad)" name="p75" />
              <Area type="monotone" dataKey="p25" stroke="none" fill="url(#fanInnerGrad)" name="p25" />
              <Line type="monotone" dataKey="median" stroke="#a855f7" strokeWidth={2} dot={false} name="median" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ResultCard>

      <ResultCard title="Percentile Table (terminal P/L per contract)">
        <div className="mc-pct-table">
          <div className="mc-pct-row mc-pct-head">
            <span>Percentile</span><span>P5</span><span>P25</span><span>P50</span><span>P75</span><span>P95</span>
          </div>
          <div className="mc-pct-row">
            <span>P/L</span>
            <span className="text-red">{fmt$(analysis.percentiles.p5, 0)}</span>
            <span>{fmt$(analysis.percentiles.p25, 0)}</span>
            <span>{fmt$(analysis.percentiles.p50, 0)}</span>
            <span>{fmt$(analysis.percentiles.p75, 0)}</span>
            <span className="text-green">{fmt$(analysis.percentiles.p95, 0)}</span>
          </div>
        </div>
      </ResultCard>
    </>
  );
}
