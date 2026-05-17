import { useMemo } from 'react';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import type { AssetProfile } from '../../api/types';
import {
  computeSuggestions,
  type Suggestion,
  type SuggestionSeverity,
} from '../../utils/portfolioSuggestions';

interface Props {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
  profileBySymbol: Record<string, AssetProfile | undefined>;
  cash: number;
  profileLoading: boolean;
  someProfileMissing: boolean;
}

const SEV_ICON: Record<SuggestionSeverity, string> = {
  warning: '⚠',
  notice:  '●',
  info:    'ⓘ',
};

const SEV_COLOR: Record<SuggestionSeverity, string> = {
  warning: 'var(--color-red)',
  notice:  'var(--color-yellow)',
  info:    'var(--color-blue)',
};

export default function SuggestionsSection(props: Props) {
  const suggestions: Suggestion[] = useMemo(
    () => computeSuggestions({
      positions: props.positions,
      priceBySymbol: props.priceBySymbol,
      profileBySymbol: props.profileBySymbol,
      cash: props.cash,
    }),
    [props.positions, props.priceBySymbol, props.profileBySymbol, props.cash],
  );

  const empty = props.positions.length === 0;
  const waiting = (props.profileLoading || props.someProfileMissing) && !empty;

  return (
    <div className="analysis-section">
      <div className="analysis-section-header">
        <h4 className="analysis-section-title">Suggestions</h4>
        <span className="suggestions-source-pill" title="Rule-based suggestions. AI-driven insights can be enabled when Phase 6 ships.">
          Rule-based
        </span>
      </div>

      {empty ? (
        <div className="analysis-empty">Add positions to get suggestions</div>
      ) : waiting ? (
        <div className="analysis-empty">Loading profile data…</div>
      ) : suggestions.length === 0 ? (
        <div className="analysis-empty">
          Nothing flagged — your portfolio looks reasonably diversified across the rules we check.
        </div>
      ) : (
        <div className="suggestions-list">
          {suggestions.map(s => (
            <div key={s.id} className={`suggestion-card sev-${s.severity}`}>
              <div className="suggestion-card-header">
                <span
                  className="suggestion-card-icon"
                  style={{ color: SEV_COLOR[s.severity] }}
                  aria-hidden
                >
                  {SEV_ICON[s.severity]}
                </span>
                <span className="suggestion-card-title">{s.title}</span>
                {s.source === 'ai' && (
                  <span className="suggestion-card-source-badge">AI</span>
                )}
              </div>
              <p className="suggestion-card-rationale">{s.rationale}</p>
              {s.candidates.length > 0 && (
                <div className="suggestion-card-candidates">
                  {s.candidates.map(c => (
                    <span key={c.symbol} className="suggestion-candidate-pill" title={c.hint}>
                      {c.symbol}
                      {c.hint && <span className="suggestion-candidate-hint"> · {c.hint}</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="analysis-disclosure">
        Rules-based heuristics only. Suggestions are educational, not financial advice.
      </div>
    </div>
  );
}
