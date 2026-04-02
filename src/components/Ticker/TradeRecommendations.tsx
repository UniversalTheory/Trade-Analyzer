import type { PriceBar, QuoteData } from '../../api/types';
import { calcRSI, calcMACD, calcSMA } from '../../utils/technicals';

interface Props {
  quote: QuoteData;
  bars: PriceBar[];
}

interface Signal {
  label: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  reason: string;
}

interface Recommendation {
  strategy: string;
  rationale: string;
  type: 'bullish' | 'bearish' | 'neutral';
  risk: 'low' | 'medium' | 'high';
}

function buildSignals(quote: QuoteData, bars: PriceBar[]): Signal[] {
  const signals: Signal[] = [];
  if (bars.length < 30) return signals;

  const closes = bars.map(b => b.close);
  const lastClose = closes[closes.length - 1];

  // RSI signal
  const rsi = calcRSI(bars, 14);
  if (rsi.length > 0) {
    const lastRSI = rsi[rsi.length - 1].value;
    if (lastRSI > 70) {
      signals.push({ label: `RSI ${lastRSI.toFixed(1)}`, direction: 'bearish', reason: 'Overbought (>70)' });
    } else if (lastRSI < 30) {
      signals.push({ label: `RSI ${lastRSI.toFixed(1)}`, direction: 'bullish', reason: 'Oversold (<30)' });
    } else {
      signals.push({ label: `RSI ${lastRSI.toFixed(1)}`, direction: 'neutral', reason: 'Neutral zone (30–70)' });
    }
  }

  // MACD signal
  const macd = calcMACD(bars);
  if (macd.length >= 2) {
    const last = macd[macd.length - 1];
    const prev = macd[macd.length - 2];
    const crossedUp = prev.macd < prev.signal && last.macd > last.signal;
    const crossedDown = prev.macd > prev.signal && last.macd < last.signal;
    if (crossedUp) {
      signals.push({ label: 'MACD Cross', direction: 'bullish', reason: 'Bullish MACD crossover' });
    } else if (crossedDown) {
      signals.push({ label: 'MACD Cross', direction: 'bearish', reason: 'Bearish MACD crossover' });
    } else if (last.macd > last.signal) {
      signals.push({ label: 'MACD', direction: 'bullish', reason: 'MACD above signal line' });
    } else {
      signals.push({ label: 'MACD', direction: 'bearish', reason: 'MACD below signal line' });
    }
  }

  // SMA trend signal
  const sma20 = calcSMA(bars, 20);
  const sma50 = calcSMA(bars, 50);
  if (sma20.length > 0 && sma50.length > 0) {
    const s20 = sma20[sma20.length - 1].value;
    const s50 = sma50[sma50.length - 1].value;
    if (lastClose > s20 && s20 > s50) {
      signals.push({ label: 'Trend (SMA)', direction: 'bullish', reason: 'Price > SMA20 > SMA50 (uptrend)' });
    } else if (lastClose < s20 && s20 < s50) {
      signals.push({ label: 'Trend (SMA)', direction: 'bearish', reason: 'Price < SMA20 < SMA50 (downtrend)' });
    } else {
      signals.push({ label: 'Trend (SMA)', direction: 'neutral', reason: 'Mixed SMA alignment' });
    }
  }

  // 52W position
  if (quote.week52High && quote.week52Low) {
    const range = quote.week52High - quote.week52Low;
    const pos = range > 0 ? (lastClose - quote.week52Low) / range : 0.5;
    if (pos > 0.85) {
      signals.push({ label: '52W Position', direction: 'bearish', reason: `Near 52W high (${(pos * 100).toFixed(0)}% of range)` });
    } else if (pos < 0.15) {
      signals.push({ label: '52W Position', direction: 'bullish', reason: `Near 52W low (${(pos * 100).toFixed(0)}% of range)` });
    } else {
      signals.push({ label: '52W Position', direction: 'neutral', reason: `Mid-range (${(pos * 100).toFixed(0)}% of 52W range)` });
    }
  }

  // Volume spike
  if (quote.volume && quote.avgVolume && quote.avgVolume > 0) {
    const ratio = quote.volume / quote.avgVolume;
    if (ratio > 1.5) {
      signals.push({
        label: `Vol ×${ratio.toFixed(1)}`,
        direction: quote.changePercent >= 0 ? 'bullish' : 'bearish',
        reason: `Volume ${ratio.toFixed(1)}× above average`,
      });
    }
  }

  return signals;
}

function buildRecommendations(signals: Signal[], quote: QuoteData): Recommendation[] {
  const bullCount = signals.filter(s => s.direction === 'bullish').length;
  const bearCount = signals.filter(s => s.direction === 'bearish').length;
  const total = signals.length || 1;
  const bullScore = bullCount / total;
  const bearScore = bearCount / total;

  const recs: Recommendation[] = [];

  if (bullScore >= 0.6) {
    recs.push({
      strategy: 'Long Call',
      rationale: 'Majority of signals are bullish. A long call profits from upward movement with defined risk.',
      type: 'bullish',
      risk: 'medium',
    });
    recs.push({
      strategy: 'Bull Call Spread',
      rationale: 'Reduce premium cost vs. long call. Cap upside but lower breakeven — good in moderate bullish scenarios.',
      type: 'bullish',
      risk: 'low',
    });
  } else if (bearScore >= 0.6) {
    recs.push({
      strategy: 'Long Put',
      rationale: 'Majority of signals are bearish. A long put profits from downward movement with defined risk.',
      type: 'bearish',
      risk: 'medium',
    });
    recs.push({
      strategy: 'Bear Put Spread',
      rationale: 'Reduce premium cost vs. long put. Cap downside profit but lower cost basis.',
      type: 'bearish',
      risk: 'low',
    });
  } else {
    recs.push({
      strategy: 'Iron Condor',
      rationale: 'Mixed or neutral signals suggest range-bound price action. Sell premium by defining a profit zone between two OTM strikes.',
      type: 'neutral',
      risk: 'low',
    });
    recs.push({
      strategy: 'Short Straddle / Strangle',
      rationale: 'Collect premium if IV is elevated and you expect low realized volatility going forward.',
      type: 'neutral',
      risk: 'high',
    });
  }

  return recs;
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

export default function TradeRecommendations({ quote, bars }: Props) {
  const signals = buildSignals(quote, bars);
  const recs = buildRecommendations(signals, quote);

  const bullCount = signals.filter(s => s.direction === 'bullish').length;
  const bearCount = signals.filter(s => s.direction === 'bearish').length;
  const sentiment =
    bullCount > bearCount ? 'Bullish' : bearCount > bullCount ? 'Bearish' : 'Neutral';
  const sentimentClass =
    bullCount > bearCount ? 'text-green' : bearCount > bullCount ? 'text-red' : 'text-yellow';

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

  return (
    <div className="trade-recs-card">
      <div className="trade-recs-header">
        <div className="trade-recs-title">Trade Recommendations</div>
        <div className="trade-recs-sentiment">
          Overall: <span className={sentimentClass}>{sentiment}</span>
          <span className="trade-recs-counts">
            {bullCount}▲ {bearCount}▼
          </span>
        </div>
      </div>

      <div className="trade-recs-signals">
        {signals.map((s, i) => (
          <div key={i} className="signal-pill">
            <span className={`signal-icon ${DIRECTION_COLOR[s.direction]}`}>
              {DIRECTION_ICON[s.direction]}
            </span>
            <span className="signal-label">{s.label}</span>
            <span className="signal-reason">{s.reason}</span>
          </div>
        ))}
      </div>

      <div className="trade-recs-list">
        {recs.map((r, i) => (
          <div key={i} className={`trade-rec-item ${r.type}`}>
            <div className="trade-rec-strategy">{r.strategy}</div>
            <div className="trade-rec-rationale">{r.rationale}</div>
            <div className="trade-rec-risk">
              Risk: <span className={RISK_COLOR[r.risk]}>{r.risk.charAt(0).toUpperCase() + r.risk.slice(1)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
