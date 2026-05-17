import { useState, useMemo } from 'react';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import type { AssetProfile } from '../../api/types';
import { computeConcentration } from '../../utils/portfolioAnalysis';
import AllocationSection from './AllocationSection';
import ConcentrationSection from './ConcentrationSection';

interface Props {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
  profileBySymbol: Record<string, AssetProfile | undefined>;
  cash: number;
  profileLoading: boolean;
  someProfileMissing: boolean;
}

export default function AnalysisCard(props: Props) {
  const [expanded, setExpanded] = useState(false);

  // Headline summary for the collapsed state.
  const headline = useMemo(() => {
    if (props.positions.length === 0) return 'Add positions to enable analysis';
    const conc = computeConcentration(props.positions, props.priceBySymbol);
    if (conc.count === 0) return 'Loading prices…';
    const largestStr = `${(conc.largestPct * 100).toFixed(0)}% in largest`;
    return `${conc.count} position${conc.count !== 1 ? 's' : ''} · ${conc.hhiBand} · ${largestStr}`;
  }, [props.positions, props.priceBySymbol]);

  const disabled = props.positions.length === 0;

  return (
    <div className={`analysis-card ${expanded ? 'is-expanded' : ''}`}>
      <button
        className="analysis-card-header"
        onClick={() => !disabled && setExpanded(e => !e)}
        type="button"
        disabled={disabled}
        aria-expanded={expanded}
      >
        <div className="analysis-card-header-left">
          <span className="analysis-card-title">Analysis</span>
          <span className="analysis-card-headline">{headline}</span>
        </div>
        {!disabled && (
          <span className={`analysis-card-chevron ${expanded ? 'is-expanded' : ''}`}>▾</span>
        )}
      </button>

      {expanded && (
        <div className="analysis-card-body">
          <AllocationSection
            positions={props.positions}
            priceBySymbol={props.priceBySymbol}
            profileBySymbol={props.profileBySymbol}
            cash={props.cash}
            profileLoading={props.profileLoading}
            someProfileMissing={props.someProfileMissing}
          />
          <ConcentrationSection
            positions={props.positions}
            priceBySymbol={props.priceBySymbol}
          />
          {/* Phase 3b (risk metrics) and 3c (suggestions) will mount here. */}
        </div>
      )}
    </div>
  );
}
