import { useState } from 'react';
import type { PriceBar, QuoteData, FundamentalsData, OptionsChainData } from '../../api/types';
import { scoreSignals, buildRecommendations, generateTradesSummary } from '../../utils/recommendationEngine';
import type { Signal, Recommendation } from '../../utils/recommendationEngine';
import type { RiskFactor } from '../../utils/riskCalculations';

interface Props {
  quote: QuoteData;
  bars: PriceBar[];
  fundamentals?: FundamentalsData;
  optionsChain?: OptionsChainData;
}

const DIRECTION_COLOR: Record<Signal['direction'], string> = {
  bullish: 'text-green',
  bearish: 'text-red',
  neutral: 'text-yellow',
};

const DIRECTION_ICON: Record<Signal['direction'], string> = {
  bullish: '▲',
  bearish: '▼',
  neutral: '◆',
};

const RISK_COLOR: Record<Recommendation['risk'], string> = {
  low: 'text-green',
  medium: 'text-yellow',
  high: 'text-red',
};

const CATEGORY_CLASS: Record<string, string> = {
  technical: 'signal-pill--technical',
  fundamental: 'signal-pill--fundamental',
  volatility: 'signal-pill--volatility',
};

const SEVERITY_CLASS: Record<RiskFactor['severity'], string> = {
  low: 'risk-factor--low',
  medium: 'risk-factor--medium',
  high: 'risk-factor--high',
};

function RecCard({ r, index }: { r: Recommendation; index: number }) {
  const [riskOpen, setRiskOpen] = useState(false);
  const [ivOpen, setIvOpen] = useState(false);
  const rb = r.riskBreakdown;
  const iv = r.ivContext;

  return (
    <div className={`trade-rec-item ${r.type}`}>
      <div className="trade-rec-top-row">
        <div className="trade-rec-strategy">{r.strategy}</div>
        <div className="trade-rec-badges">
          <span className={`trade-rec-type-badge ${r.type}`}>
            {r.type.charAt(0).toUpperCase() + r.type.slice(1)}
          </span>
          <span className={`trade-rec-risk-badge ${RISK_COLOR[r.risk]}`}>
            {r.risk.charAt(0).toUpperCase() + r.risk.slice(1)} Risk
          </span>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="trade-rec-confidence">
        <div className="confidence-bar">
          <div
            className={`confidence-fill ${r.type}`}
            style={{ width: `${Math.round(r.confidence * 100)}%` }}
          />
        </div>
        <span className="confidence-pct">{Math.round(r.confidence * 100)}%</span>
      </div>

      {/* Primary rationale */}
      <div className="trade-rec-rationale">{r.reasoning.primary}</div>

      {/* Supporting signals */}
      {r.reasoning.supporting.length > 0 && (
        <div className="trade-rec-supporting">
          <div className="trade-rec-section-label">Key Signals</div>
          <ul>
            {r.reasoning.supporting.map((s, j) => (
              <li key={j}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk Breakdown (expandable) */}
      {rb && (
        <div className="trade-rec-expandable">
          <button
            className="trade-rec-expand-btn"
            onClick={() => setRiskOpen(o => !o)}
          >
            <span className={`expand-arrow ${riskOpen ? 'open' : ''}`}>▸</span>
            Risk Breakdown
          </button>
          {riskOpen && (
            <div className="trade-rec-risk-section">
              <div className="risk-grid">
                <div className="risk-grid-item">
                  <span className="risk-grid-label">Max Loss</span>
                  <span className="risk-grid-value text-red">{rb.maxLoss}</span>
                </div>
                <div className="risk-grid-item">
                  <span className="risk-grid-label">Max Gain</span>
                  <span className="risk-grid-value text-green">{rb.maxGain}</span>
                </div>
                {rb.riskRewardRatio != null && (
                  <div className="risk-grid-item">
                    <span className="risk-grid-label">R/R Ratio</span>
                    <span className="risk-grid-value">{rb.riskRewardRatio}:1</span>
                  </div>
                )}
                <div className="risk-grid-item">
                  <span className="risk-grid-label">Est. POP</span>
                  <span className="risk-grid-value">~{rb.probabilityEstimate}%</span>
                </div>
                <div className="risk-grid-item risk-grid-item--wide">
                  <span className="risk-grid-label">Breakeven</span>
                  <span className="risk-grid-value">{rb.breakeven}</span>
                </div>
              </div>

              {rb.keyRiskFactors.length > 0 && (
                <div className="risk-factors">
                  {rb.keyRiskFactors.map((f, j) => (
                    <div key={j} className={`risk-factor-badge ${SEVERITY_CLASS[f.severity]}`} title={f.description}>
                      {f.factor}
                    </div>
                  ))}
                </div>
              )}

              {rb.managementTips.length > 0 && (
                <div className="risk-tips">
                  <div className="trade-rec-section-label">Management Tips</div>
                  <ul>
                    {rb.managementTips.map((tip, j) => (
                      <li key={j}>{tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* IV Context (expandable) */}
      {iv && (
        <div className="trade-rec-expandable">
          <button
            className="trade-rec-expand-btn"
            onClick={() => setIvOpen(o => !o)}
          >
            <span className={`expand-arrow ${ivOpen ? 'open' : ''}`}>▸</span>
            IV Context
          </button>
          {ivOpen && (
            <div className="trade-rec-iv-section">
              <div className="iv-context-row">
                <span className="iv-context-label">IV Percentile</span>
                <span className="iv-context-value">~{iv.ivPercentile}th ({iv.ivRank.replace('-', ' ')})</span>
              </div>
              <div className="iv-context-row">
                <span className="iv-context-label">ATM IV</span>
                <span className="iv-context-value">{(iv.atmIV * 100).toFixed(1)}%</span>
              </div>
              <div className="iv-context-impact">{iv.ivImpact}</div>
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {r.reasoning.warnings.length > 0 && (
        <div className="trade-rec-warnings">
          <div className="trade-rec-section-label trade-rec-section-label--warn">Watch For</div>
          <ul>
            {r.reasoning.warnings.map((w, j) => (
              <li key={j}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function TradeRecommendations({ quote, bars, fundamentals, optionsChain }: Props) {
  if (bars.length < 30) {
    return (
      <div className="trade-recs-card">
        <div className="trade-recs-title">Trade Recommendations</div>
        <div className="empty-state small">
          <div className="empty-desc">Need more price history to generate signals.</div>
        </div>
      </div>
    );
  }

  const result = scoreSignals(quote, bars, fundamentals, optionsChain);
  const recs = buildRecommendations(result, quote, fundamentals, optionsChain);
  const summary = generateTradesSummary(quote.symbol, result, recs, fundamentals);

  const sentiment =
    result.compositeScore >= 0.15 ? 'Bullish'
    : result.compositeScore <= -0.15 ? 'Bearish'
    : 'Neutral';
  const sentimentClass =
    result.compositeScore >= 0.15 ? 'text-green'
    : result.compositeScore <= -0.15 ? 'text-red'
    : 'text-yellow';

  const confPct = Math.round(result.confidence * 100);
  const ivData = result.ivAnalysis;

  return (
    <div className="trade-recs-card">
      <div className="trade-recs-header">
        <div className="trade-recs-title">Trade Recommendations</div>
        <div className="trade-recs-sentiment">
          Overall: <span className={sentimentClass}>{sentiment}</span>
          <span className="trade-recs-score" title="Composite signal score (−1 bearish → +1 bullish)">
            score {result.compositeScore >= 0 ? '+' : ''}{result.compositeScore.toFixed(2)}
          </span>
          <span className="trade-recs-confidence-label" title="Overall confidence based on signal strength and agreement">
            {confPct}% confidence
          </span>
        </div>
      </div>

      {/* Analysis summary */}
      <div className="trade-recs-summary">{summary}</div>

      {/* IV Summary Bar */}
      {ivData && (
        <div className="iv-summary-bar">
          <span className="iv-summary-item">
            <span className="iv-summary-label">IV Percentile</span>
            <span className="iv-summary-value">~{ivData.ivPercentileEstimate}th ({ivData.ivRank.replace('-', ' ')})</span>
          </span>
          <span className="iv-summary-sep">|</span>
          <span className="iv-summary-item">
            <span className="iv-summary-label">ATM IV</span>
            <span className="iv-summary-value">{(ivData.atmIV * 100).toFixed(1)}%</span>
          </span>
          <span className="iv-summary-sep">|</span>
          <span className="iv-summary-item">
            <span className="iv-summary-label">HV(30d)</span>
            <span className="iv-summary-value">{(ivData.hv30 * 100).toFixed(1)}%</span>
          </span>
          <span className="iv-summary-sep">|</span>
          <span className="iv-summary-item">
            <span className="iv-summary-label">P/C OI</span>
            <span className="iv-summary-value">{ivData.putCallOIRatio.toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* Signal pills */}
      <div className="trade-recs-signals">
        {result.signals.map((s, i) => (
          <div key={i} className={`signal-pill ${CATEGORY_CLASS[s.category] ?? ''}`}>
            <span className={`signal-icon ${DIRECTION_COLOR[s.direction]}`}>
              {DIRECTION_ICON[s.direction]}
            </span>
            <span className="signal-label">{s.label}</span>
            <span className="signal-reason">{s.reason}</span>
          </div>
        ))}
      </div>

      {/* Signal count summary */}
      <div className="trade-recs-signal-summary">
        <span className="text-green">{result.bullishCount} bullish</span>
        <span className="trade-recs-signal-sep">·</span>
        <span className="text-red">{result.bearishCount} bearish</span>
        <span className="trade-recs-signal-sep">·</span>
        <span className="text-yellow">{result.neutralCount} neutral</span>
        <span className="trade-recs-signal-sep">·</span>
        <span className="trade-recs-agreement">
          Agreement: {Math.round(result.signalAgreement * 100)}%
        </span>
      </div>

      {/* Recommendation cards */}
      {recs.length === 0 ? (
        <div className="empty-state small">
          <div className="empty-desc">No high-confidence recommendations for the current signal mix. Signals are too mixed or weak to suggest a clear trade.</div>
        </div>
      ) : (
        <div className="trade-recs-list">
          {recs.map((r, i) => (
            <RecCard key={i} r={r} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
