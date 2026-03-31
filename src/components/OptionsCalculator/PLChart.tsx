import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type { PLChartData } from '../../utils/plChart';

interface Props {
  data: PLChartData;
  title?: string;
}

function formatDollar(val: number): string {
  if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const pl = payload[0]?.value ?? 0;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-price">Stock @ <strong>${Number(label).toFixed(2)}</strong></div>
      <div
        className="chart-tooltip-pl"
        style={{ color: pl >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}
      >
        P/L: {pl >= 0 ? '+' : ''}{formatDollar(pl)}
      </div>
    </div>
  );
}

export default function PLChart({ data, title = 'P/L at Expiration' }: Props) {
  const { points, maxProfit, maxLoss, breakevens, currentPrice } = data;

  // Split into positive and negative areas for dual coloring
  const chartData = points.map(p => ({
    price: p.price,
    profit: p.pl >= 0 ? p.pl : 0,
    loss: p.pl < 0 ? p.pl : 0,
    pl: p.pl,
  }));

  return (
    <div className="pl-chart-wrapper">
      <div className="pl-chart-header">
        <span className="pl-chart-title">{title}</span>
        <div className="pl-chart-stats">
          <span className="pl-stat profit">Max Profit: {maxProfit === Infinity ? 'Unlimited' : formatDollar(maxProfit)}</span>
          <span className="pl-stat loss">Max Loss: {formatDollar(maxLoss)}</span>
          {breakevens.length > 0 && (
            <span className="pl-stat be">
              BE: {breakevens.map(b => `$${b.toFixed(2)}`).join(' / ')}
            </span>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="lossGrad" x1="0" y1="1" x2="0" y2="0">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="price"
            tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={formatDollar}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Zero line */}
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />

          {/* Current price line */}
          {currentPrice && (
            <ReferenceLine
              x={currentPrice}
              stroke="var(--color-blue)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{ value: 'Current', fill: 'var(--color-blue)', fontSize: 10, position: 'top' }}
            />
          )}

          {/* Breakeven lines */}
          {breakevens.map((be, i) => (
            <ReferenceLine
              key={i}
              x={be}
              stroke="var(--color-yellow)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
          ))}

          <Area
            type="monotone"
            dataKey="profit"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#profitGrad)"
            dot={false}
            activeDot={false}
            name="Profit"
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="loss"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#lossGrad)"
            dot={false}
            activeDot={false}
            name="Loss"
            legendType="none"
          />

          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            formatter={() => ''}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
