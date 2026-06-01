import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import type { AssetProfile, FundData } from '../../api/types';
import {
  computeAllocation,
  assignColors,
  type AllocationDimension,
  type AllocationSlice,
} from '../../utils/portfolioAnalysis';
import { fmtUSD, fmtPct } from '../../utils/portfolioCalc';

interface Props {
  positions: PortfolioPosition[];
  priceBySymbol: Record<string, number | undefined>;
  profileBySymbol: Record<string, AssetProfile | undefined>;
  fundDataBySymbol: Record<string, FundData | undefined>;
  cash: number;
  profileLoading: boolean;
  someProfileMissing: boolean;
}

const DIMENSIONS: { id: AllocationDimension; label: string }[] = [
  { id: 'sector',     label: 'Sector' },
  { id: 'assetClass', label: 'Asset Class' },
  { id: 'geography',  label: 'Geography' },
];

export default function AllocationSection({
  positions,
  priceBySymbol,
  profileBySymbol,
  fundDataBySymbol,
  cash,
  profileLoading,
  someProfileMissing,
}: Props) {
  const [dimension, setDimension] = useState<AllocationDimension>('sector');

  const slices: AllocationSlice[] = useMemo(
    () => computeAllocation(positions, priceBySymbol, profileBySymbol, cash, dimension, fundDataBySymbol),
    [positions, priceBySymbol, profileBySymbol, fundDataBySymbol, cash, dimension],
  );

  const fundCount = positions.filter(p => p.type === 'fund').length;
  const someFundDataMissing = positions.some(p => p.type === 'fund' && !(p.symbol in fundDataBySymbol));

  const colorMap = useMemo(() => assignColors(slices.map(s => s.label)), [slices]);
  const colored = slices.map(s => ({ ...s, color: colorMap[s.label] }));
  const totalValue = slices.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="analysis-section">
      <div className="analysis-section-header">
        <h4 className="analysis-section-title">Allocation</h4>
        <div className="analysis-dim-toggle">
          {DIMENSIONS.map(d => (
            <button
              key={d.id}
              className={`analysis-dim-pill ${dimension === d.id ? 'is-active' : ''}`}
              onClick={() => setDimension(d.id)}
              type="button"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {slices.length === 0 ? (
        <div className="analysis-empty">
          {profileLoading || someProfileMissing
            ? 'Loading profile data…'
            : 'No data to allocate yet'}
        </div>
      ) : (
        <div className="allocation-body">
          <div className="allocation-donut">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={colored}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={1.5}
                  isAnimationActive={false}
                  stroke="var(--bg-card)"
                  strokeWidth={2}
                >
                  {colored.map(s => (
                    <Cell key={s.label} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                  formatter={(value: number, _name: string, ctx: any) => [
                    `$${fmtUSD(value)} (${fmtPct(ctx.payload.pct)})`,
                    ctx.payload.label,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="allocation-donut-center">
              <div className="allocation-donut-center-label">Total</div>
              <div className="allocation-donut-center-value">${fmtUSD(totalValue, 0)}</div>
            </div>
          </div>

          <ul className="allocation-legend">
            {colored.map(s => (
              <li key={s.label} className="allocation-legend-row">
                <span className="allocation-legend-swatch" style={{ background: s.color }} />
                <span className="allocation-legend-label">{s.label}</span>
                <span className="allocation-legend-pct">{fmtPct(s.pct)}</span>
                <span className="allocation-legend-value">${fmtUSD(s.value, 0)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dimension === 'sector' && fundCount > 0 && (
        <div className="analysis-disclosure">
          {someFundDataMissing
            ? 'Resolving fund holdings to underlying sectors…'
            : <>Fund holdings are distributed across their underlying sectors. Any unclassified portion (e.g. a bond sleeve, or funds missing sector data) is grouped under <em>ETF / Fund</em>.</>}
        </div>
      )}
      {dimension === 'geography' && slices.length > 0 && (
        <div className="analysis-disclosure">
          ETF geography is approximate — fund holdings aren't fetched. ETFs without a clear category land in <em>Global / Mixed</em>.
        </div>
      )}
    </div>
  );
}
