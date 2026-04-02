import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { QuoteData, PriceBar } from '../../api/types';
import type { SectorDefinition } from '../../api/types';

interface Props {
  sector: SectorDefinition;
  quote: QuoteData;
  history: PriceBar[];
}

function PerfBadge({ label, value }: { label: string; value: number | undefined }) {
  if (value === undefined) return null;
  const up = value >= 0;
  return (
    <div className="perf-badge">
      <span className="perf-badge-label">{label}</span>
      <span className="perf-badge-value" style={{ color: up ? 'var(--color-green)' : 'var(--color-red)' }}>
        {up ? '+' : ''}{value.toFixed(2)}%
      </span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-price">{label}</div>
      <div className="chart-tooltip-pl" style={{ color: 'var(--color-blue)' }}>
        ${Number(payload[0]?.value).toFixed(2)}
      </div>
    </div>
  );
}

// Direct hex values — CSS variables don't resolve inside SVG <stop> attributes
const HEX_GREEN = '#22c55e';
const HEX_RED   = '#ef4444';

export default function SectorOverview({ sector, quote, history }: Props) {
  const up = quote.changePercent >= 0;
  const color    = up ? 'var(--color-green)' : 'var(--color-red)';
  const hexColor = up ? HEX_GREEN : HEX_RED;
  // Unique gradient ID per sector to avoid SVG <defs> collisions across renders
  const gradId   = `sectorGrad-${sector.id}-${up ? 'up' : 'dn'}`;

  // Chart data — show last 60 bars
  const chartData = history.slice(-60).map(b => ({
    date: new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: b.close,
  }));

  // Calculate approximate multi-timeframe performance from history
  const closes = history.map(b => b.close);
  const current = closes[closes.length - 1] ?? quote.price;

  function perfPct(daysBack: number): number | undefined {
    const idx = closes.length - 1 - daysBack;
    if (idx < 0) return undefined;
    const base = closes[idx];
    return base ? ((current - base) / base) * 100 : undefined;
  }

  return (
    <div className="sector-overview-panel">
      {/* Header */}
      <div className="sector-overview-header">
        <div className="sector-overview-left">
          <div className="sector-overview-name">{sector.name}</div>
          <div className="sector-overview-etf">
            <span className="etf-badge">{sector.etf}</span>
            <span className="sector-overview-desc">{sector.description}</span>
          </div>
        </div>
        <div className="sector-overview-price-block">
          <div className="sector-price" style={{ color }}>
            ${quote.price.toFixed(2)}
          </div>
          <div className="sector-change" style={{ color }}>
            {up ? '▲' : '▼'} {up ? '+' : ''}{quote.changePercent.toFixed(2)}% today
          </div>
        </div>
      </div>

      {/* Performance row */}
      <div className="perf-row">
        <PerfBadge label="1D"  value={quote.changePercent} />
        <PerfBadge label="1W"  value={perfPct(5)} />
        <PerfBadge label="1M"  value={perfPct(21)} />
        <PerfBadge label="3M"  value={perfPct(63)} />
        <PerfBadge label="YTD" value={perfPct(Math.min(63, closes.length - 1))} />
      </div>

      {/* Price chart */}
      {chartData.length > 5 && (
        <div className="sector-chart">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={hexColor} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={hexColor} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={Math.floor(chartData.length / 6)}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => `$${v}`}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="price"
                stroke={hexColor}
                strokeWidth={2}
                fill={`url(#${gradId})`}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top holdings */}
      <div className="top-holdings">
        <span className="top-holdings-label">Top Holdings:</span>
        {sector.topHoldings.map(ticker => (
          <span key={ticker} className="holding-tag">{ticker}</span>
        ))}
      </div>
    </div>
  );
}
