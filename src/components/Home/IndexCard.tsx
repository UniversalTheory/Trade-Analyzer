import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import type { QuoteData, PriceBar } from '../../api/types';
import { AnimatedNumber } from '../AnimatedNumber';

interface Props {
  quote: QuoteData;
  history?: PriceBar[];
  isVix?: boolean;
}

function isUSMarketOpen(): boolean {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
  const hour    = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute  = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');

  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const nowMins   = hour * 60 + minute;
  return !isWeekend && nowMins >= 570 && nowMins < 960; // 9:30–16:00 ET
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
  const color = up ? 'var(--color-green)' : 'var(--color-red)';

  const displayName = DISPLAY_NAMES[quote.symbol] ?? quote.symbol;
  const vix = isVix ? vixLabel(quote.price) : null;
  const marketOpen = !isVix && isUSMarketOpen();

  const sparkData = history?.slice(-30).map(b => ({ v: b.close })) ?? [];

  return (
    <div className={`index-card ${up ? 'up' : 'down'}`}>
      <div className="index-card-header">
        <div>
          <div className="index-card-name">{displayName}</div>
          <div className="index-card-symbol">
            {!isVix && (
              <span className={`market-status-dot ${marketOpen ? 'open' : 'closed'}`} style={{ marginRight: 4 }} />
            )}
            {quote.symbol}
          </div>
        </div>
        {vix && (
          <span className="index-vix-badge" style={{ color: vix.color, borderColor: vix.color }}>
            {vix.label}
          </span>
        )}
      </div>

      <div className="index-card-price" style={{ color }}>
        <AnimatedNumber value={quote.price} decimals={2} />
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
