import { useMemo } from 'react';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import type { PriceBar } from '../../api/types';
import {
  computePortfolioRisk,
  computeCorrelationMatrix,
  LOOKBACK_DAYS,
  type LookbackId,
} from '../../utils/portfolioRisk';
import { fmtPct } from '../../utils/portfolioCalc';

interface Props {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
  historyBySymbol: Record<string, PriceBar[] | undefined>;
  spyHistory: PriceBar[] | undefined;
  lookback: LookbackId;
  onLookbackChange: (next: LookbackId) => void;
  historyLoading: boolean;
  someHistoryMissing: boolean;
}

const LOOKBACK_OPTIONS: LookbackId[] = ['1y', '2y', '5y'];

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function corrColor(c: number): string {
  // Map [-1, 1] → red…neutral…green. Background tints for the cell.
  // Strongly correlated (positive) = red (diversification concern).
  // Strongly anti-correlated = green (good diversifier).
  // Near zero = neutral.
  const clamp = Math.max(-1, Math.min(1, c));
  if (clamp >= 0) {
    const a = clamp * 0.55;
    return `rgba(239, 68, 68, ${a.toFixed(3)})`;
  } else {
    const a = -clamp * 0.55;
    return `rgba(34, 197, 94, ${a.toFixed(3)})`;
  }
}

export default function RiskSection(props: Props) {
  const {
    positions, priceBySymbol, historyBySymbol, spyHistory,
    lookback, onLookbackChange, historyLoading, someHistoryMissing,
  } = props;

  const risk = useMemo(
    () => computePortfolioRisk({
      positions, priceBySymbol, historyBySymbol, spyHistory, lookback,
    }),
    [positions, priceBySymbol, historyBySymbol, spyHistory, lookback],
  );

  const corr = useMemo(
    () => computeCorrelationMatrix({
      positions, priceBySymbol, historyBySymbol, spyHistory: undefined, lookback,
    }),
    [positions, priceBySymbol, historyBySymbol, lookback],
  );

  const pricedCount = positions.filter(p => {
    const px = priceBySymbol[p.symbol];
    return typeof px === 'number' && isFinite(px) && px > 0;
  }).length;

  const waiting = (historyLoading || someHistoryMissing) && pricedCount > 0;
  const empty = pricedCount === 0;

  return (
    <div className="analysis-section">
      <div className="analysis-section-header">
        <h4 className="analysis-section-title">Risk</h4>
        <div className="analysis-dim-toggle">
          {LOOKBACK_OPTIONS.map(id => (
            <button
              key={id}
              className={`analysis-dim-pill ${lookback === id ? 'is-active' : ''}`}
              onClick={() => onLookbackChange(id)}
              type="button"
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <div className="analysis-empty">Add positions to see risk metrics</div>
      ) : waiting ? (
        <div className="analysis-empty">Loading history…</div>
      ) : risk.includedSymbols.length === 0 ? (
        <div className="analysis-empty">Not enough history yet to compute risk</div>
      ) : (
        <>
          <div className="risk-stats-grid">
            <div className="risk-stat" title="Portfolio beta vs SPY, computed by regressing portfolio NAV daily returns against SPY over the selected lookback. <0.8 Defensive, 0.8–1.2 Balanced, >1.2 Aggressive.">
              <div className="risk-stat-label">Beta vs SPY</div>
              <div className="risk-stat-value">
                {risk.beta != null ? risk.beta.toFixed(2) : '—'}
                {risk.betaBand && (
                  <span
                    className="risk-band-pill"
                    style={{ color: risk.betaBand.color, borderColor: risk.betaBand.color }}
                  >
                    {risk.betaBand.label}
                  </span>
                )}
              </div>
            </div>
            <div className="risk-stat" title="Annualized standard deviation of daily portfolio returns over the selected lookback.">
              <div className="risk-stat-label">Volatility (ann.)</div>
              <div className="risk-stat-value">
                {risk.volatility != null ? fmtPct(risk.volatility) : '—'}
              </div>
            </div>
            <div className="risk-stat" title="Largest peak-to-trough drop in portfolio NAV over the lookback, using current shares replayed over historical prices.">
              <div className="risk-stat-label">Max drawdown</div>
              <div className="risk-stat-value" style={{ color: 'var(--color-red)' }}>
                {risk.maxDrawdown != null ? fmtPct(risk.maxDrawdown) : '—'}
              </div>
              {risk.maxDrawdownPeak && risk.maxDrawdownTrough && (
                <div className="risk-stat-meta">
                  {fmtDateShort(risk.maxDrawdownPeak)} → {fmtDateShort(risk.maxDrawdownTrough)}
                </div>
              )}
            </div>
          </div>

          {corr.symbols.length >= 2 ? (
            <div className="risk-corr">
              <div className="risk-corr-header">
                <span className="risk-corr-title">Correlation Matrix</span>
                <span className="risk-corr-meta">
                  Avg pairwise {corr.avgPairwise.toFixed(2)}
                  {corr.highestPair && ` · highest ${corr.highestPair.symA}/${corr.highestPair.symB} ${corr.highestPair.corr.toFixed(2)}`}
                  {corr.lowestPair  && ` · lowest ${corr.lowestPair.symA}/${corr.lowestPair.symB} ${corr.lowestPair.corr.toFixed(2)}`}
                </span>
              </div>
              <div className="risk-corr-scroll">
                <table className="risk-corr-table">
                  <thead>
                    <tr>
                      <th></th>
                      {corr.symbols.map(s => <th key={s}>{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {corr.symbols.map((rowSym, i) => (
                      <tr key={rowSym}>
                        <th>{rowSym}</th>
                        {corr.symbols.map((colSym, j) => (
                          <td
                            key={colSym}
                            style={{ background: i === j ? 'var(--bg-secondary)' : corrColor(corr.matrix[i][j]) }}
                            title={`${rowSym} / ${colSym}: ${corr.matrix[i][j].toFixed(3)}`}
                          >
                            {corr.matrix[i][j].toFixed(2)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="analysis-empty">Need 2+ positions with history to show correlation</div>
          )}

          {risk.excludedSymbols.length > 0 && (
            <div className="analysis-disclosure">
              Excluded from risk metrics (insufficient history): {risk.excludedSymbols.join(', ')}.
            </div>
          )}
          <div className="analysis-disclosure">
            Cash is excluded from risk. Metrics describe the holdings portion only, replayed over {LOOKBACK_DAYS[lookback]} trading days ({risk.observationDays} aligned).
          </div>
        </>
      )}
    </div>
  );
}
