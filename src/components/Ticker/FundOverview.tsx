import type { FundData, AssetQuoteType } from '../../api/types';

interface Props {
  fund: FundData;
  quoteType?: AssetQuoteType;
}

function fmtPct(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

// Yahoo doesn't always populate legalType — fall back to the quoteType.
function fmtType(legalType: string | undefined, quoteType: AssetQuoteType | undefined): string {
  if (legalType) return legalType;
  if (quoteType === 'ETF') return 'Exchange Traded Fund';
  if (quoteType === 'MUTUALFUND') return 'Mutual Fund';
  return '—';
}

export default function FundOverview({ fund, quoteType }: Props) {
  const stats: { label: string; value: string }[] = [
    { label: 'Type',               value: fmtType(fund.legalType, quoteType) },
    { label: 'Category',           value: fund.category ?? '—' },
    { label: 'Fund Family',        value: fund.family ?? '—' },
    { label: 'Expense Ratio',      value: fmtPct(fund.expenseRatio) },
    { label: 'Distribution Yield', value: fmtPct(fund.yield) },
  ];

  return (
    <div className="fund-overview-card">
      <div className="fund-overview-heading">Fund Overview</div>
      <div className="fund-overview-grid">
        {stats.map(s => (
          <div key={s.label} className="fund-overview-stat">
            <span className="fund-overview-stat-label">{s.label}</span>
            <span className="fund-overview-stat-value">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
