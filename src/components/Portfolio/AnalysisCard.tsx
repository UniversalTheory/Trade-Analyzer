import { useMemo } from 'react';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import type { AssetProfile, PriceBar, FundData } from '../../api/types';
import { computeConcentration } from '../../utils/portfolioAnalysis';
import type { LookbackId } from '../../utils/portfolioRisk';
import AllocationSection from './AllocationSection';
import ConcentrationSection from './ConcentrationSection';
import RiskSection from './RiskSection';
import SuggestionsSection from './SuggestionsSection';

interface Props {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
  profileBySymbol: Record<string, AssetProfile | undefined>;
  fundDataBySymbol: Record<string, FundData | undefined>;
  historyBySymbol: Record<string, PriceBar[] | undefined>;
  spyHistory: PriceBar[] | undefined;
  cash: number;
  profileLoading: boolean;
  someProfileMissing: boolean;
  historyLoading: boolean;
  someHistoryMissing: boolean;
  riskLookback: LookbackId;
  onRiskLookbackChange: (next: LookbackId) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onShowInResearch?: (symbol: string) => void;
}

export default function AnalysisCard(props: Props) {
  const headline = useMemo(() => {
    if (props.positions.length === 0) return 'Add positions to enable analysis';
    const conc = computeConcentration(props.positions, props.priceBySymbol);
    if (conc.count === 0) return 'Loading prices…';
    const largestStr = `${(conc.largestPct * 100).toFixed(0)}% in largest`;
    return `${conc.count} position${conc.count !== 1 ? 's' : ''} · ${conc.hhiBand} · ${largestStr}`;
  }, [props.positions, props.priceBySymbol]);

  const disabled = props.positions.length === 0;

  return (
    <div className={`analysis-card ${props.expanded ? 'is-expanded' : ''}`}>
      <button
        className="analysis-card-header"
        onClick={() => !disabled && props.onToggleExpanded()}
        type="button"
        disabled={disabled}
        aria-expanded={props.expanded}
      >
        <div className="analysis-card-header-left">
          <span className="analysis-card-title">Analysis</span>
          <span className="analysis-card-headline">{headline}</span>
        </div>
        {!disabled && (
          <span className={`analysis-card-chevron ${props.expanded ? 'is-expanded' : ''}`}>▾</span>
        )}
      </button>

      {props.expanded && (
        <div className="analysis-card-body">
          <AllocationSection
            positions={props.positions}
            priceBySymbol={props.priceBySymbol}
            profileBySymbol={props.profileBySymbol}
            fundDataBySymbol={props.fundDataBySymbol}
            cash={props.cash}
            profileLoading={props.profileLoading}
            someProfileMissing={props.someProfileMissing}
          />
          <ConcentrationSection
            positions={props.positions}
            priceBySymbol={props.priceBySymbol}
            onShowInResearch={props.onShowInResearch}
          />
          <RiskSection
            positions={props.positions}
            priceBySymbol={props.priceBySymbol}
            historyBySymbol={props.historyBySymbol}
            spyHistory={props.spyHistory}
            lookback={props.riskLookback}
            onLookbackChange={props.onRiskLookbackChange}
            historyLoading={props.historyLoading}
            someHistoryMissing={props.someHistoryMissing}
          />
          <SuggestionsSection
            positions={props.positions}
            priceBySymbol={props.priceBySymbol}
            profileBySymbol={props.profileBySymbol}
            fundDataBySymbol={props.fundDataBySymbol}
            cash={props.cash}
            profileLoading={props.profileLoading}
            someProfileMissing={props.someProfileMissing}
          />
        </div>
      )}
    </div>
  );
}
