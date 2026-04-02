import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { QuoteData, PriceBar } from '../../api/types';

interface Props {
  quote: QuoteData;
  history?: PriceBar[];
  isVix?: boolean;
}

const DISPLAY_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': 'Nasdaq Composite',
  '^DJI':  'Dow Jones',
  '^RUT':  'Russell 2000',
  '^VIX':  'VIX',
};

function vixLabel(price: number): { label: string; color: string } {
  if (price < 15) return { label: 'Low Fear', color: 'var(--color-green)' };
  if (price < 20) return { label: 'Normal', color: 'var(--color-blue)' };
  if (price < 30) return { label: 'Elevated', color: 'var(--color-yellow)' };
  return { label: 'High Fear', color: 'var(--color-red)' };
}

export default function IndexCard({ quote, history, isVix }: Props) {
  const up = quote.changePercent >= 0;
  const color = isVix
    ? (quote.price < 20 ? 'var(--color-green)' : quote.price < 30 ? 'var(--color-yellow)' : 'var(--color-red)')
    : (up ? 'var(--color-green)' : 'var(--color-red)');

  const displayName = DISPLAY_NAMES[quote.symbol] ?? quote.symbol;
  const vix = isVix ? vixLabel(quote.price) : null;

  const sparkData = history?.slice(-30).map(b => ({ v: b.close })) ?? [];

  return (
    <div className={`index-card ${up && !isVix ? 'up' : !up && !isVix ? 'down' : ''}`}>
      <div className="index-card-header">
        <div>
          <div className="index-card-name">{displayName}</div>
          <div className="index-card-symbol">{quote.symbol}</div>
        </div>
        {vix && (
          <span className="index-vix-badge" style={{ color: vix.color, borderColor: vix.color }}>
            {vix.label}
          </span>
        )}
      </div>

      <div className="index-card-price" style={{ color }}>
        {quote.price.toFixed(2)}
      </div>

      <div className="index-card-change">
        <span style={{ color }}>
          {up ? '▲' : '▼'} {Math.abs(quote.changePercent).toFixed(2)}%
        </span>
        <span className="index-card-pts" style={{ color }}>
          {up ? '+' : ''}{quote.change.toFixed(2)} pts
        </span>
      </div>

      {sparkData.length > 2 && (
        <div className="index-sparkline">
          <ResponsiveContainer width="100%" height={42}>
            <LineChart data={sparkData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Tooltip
                content={() => null}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
