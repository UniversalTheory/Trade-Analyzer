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
  score: number; // -1 (strong bearish) → +1 (strong bullish)
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

  // ── RSI: graded score across the full range ──
  const rsi = calcRSI(bars, 14);
  if (rsi.length > 0) {
    const r = rsi[rsi.length - 1].value;
    let score: number;
    let direction: Signal['direction'];
    let reason: string;

    if (r >= 75) {
      score = -1; direction = 'bearish'; reason = `Strongly overbought (${r.toFixed(1)})`;
    } else if (r >= 65) {
      score = -0.5; direction = 'bearish'; reason = `Overbought territory (${r.toFixed(1)})`;
    } else if (r >= 55) {
      score = 0.3; direction = 'bullish'; reason = `Bullish momentum (${r.toFixed(1)})`;
    } else if (r >= 45) {
      score = 0; direction = 'neutral'; reason = `Neutral (${r.toFixed(1)})`;
    } else if (r >= 35) {
      score = -0.3; direction = 'bearish'; reason = `Bearish momentum (${r.toFixed(1)})`;
    } else if (r >= 25) {
      score = 0.5; direction = 'bullish'; reason = `Oversold territory (${r.toFixed(1)})`;
    } else {
      score = 1; direction = 'bullish'; reason = `Strongly oversold (${r.toFixed(1)})`;
    }
    signals.push({ label: `RSI ${r.toFixed(1)}`, direction, reason, score });
  }

  // ── MACD: crossover + histogram momentum ──
  const macd = calcMACD(bars);
  if (macd.length >= 3) {
    const last = macd[macd.length - 1];
    const prev = macd[macd.length - 2];
    const prev2 = macd[macd.length - 3];

    const crossedUp = prev.macd < prev.signal && last.macd > last.signal;
    const crossedDown = prev.macd > prev.signal && last.macd < last.signal;
    const histGrowing = last.histogram > prev.histogram && prev.histogram > prev2.histogram;
    const histShrinking = last.histogram < prev.histogram && prev.histogram < prev2.histogram;
    const aboveSignal = last.macd > last.signal;

    let score: number;
    let direction: Signal['direction'];
    let reason: string;

    if (crossedUp) {
      score = 0.9; direction = 'bullish'; reason = 'Bullish MACD crossover';
    } else if (crossedDown) {
      score = -0.9; direction = 'bearish'; reason = 'Bearish MACD crossover';
    } else if (aboveSignal && histGrowing) {
      score = 0.7; direction = 'bullish'; reason = 'MACD above signal, histogram expanding';
    } else if (aboveSignal && histShrinking) {
      score = 0.2; direction = 'bullish'; reason = 'MACD above signal, momentum fading';
    } else if (!aboveSignal && histShrinking) {
      score = -0.7; direction = 'bearish'; reason = 'MACD below signal, histogram expanding negatively';
    } else if (!aboveSignal && histGrowing) {
      score = -0.2; direction = 'bearish'; reason = 'MACD below signal, downside momentum fading';
    } else {
      score = aboveSignal ? 0.4 : -0.4;
      direction = aboveSignal ? 'bullish' : 'bearish';
      reason = aboveSignal ? 'MACD above signal line' : 'MACD below signal line';
    }
    signals.push({ label: 'MACD', direction, reason, score });
  }

  // ── SMA Trend: price vs moving averages ──
  const sma20 = calcSMA(bars, 20);
  const sma50 = calcSMA(bars, 50);
  if (sma20.length > 0) {
    const s20 = sma20[sma20.length - 1].value;
    const s50 = sma50.length > 0 ? sma50[sma50.length - 1].value : null;

    let score: number;
    let direction: Signal['direction'];
    let reason: string;

    if (s50 !== null) {
      if (lastClose > s20 && s20 > s50) {
        score = 0.8; direction = 'bullish'; reason = 'Price > SMA20 > SMA50 (uptrend)';
      } else if (lastClose > s20 && s20 < s50) {
        score = 0.2; direction = 'bullish'; reason = 'Price above SMA20, recovering toward SMA50';
      } else if (lastClose < s20 && s20 > s50) {
        score = -0.2; direction = 'bearish'; reason = 'Pullback below SMA20 within uptrend';
      } else {
        score = -0.8; direction = 'bearish'; reason = 'Price < SMA20 < SMA50 (downtrend)';
      }
    } else {
      // Only SMA20 available
      if (lastClose > s20) {
        score = 0.5; direction = 'bullish'; reason = `Price above SMA20 ($${s20.toFixed(2)})`;
      } else {
        score = -0.5; direction = 'bearish'; reason = `Price below SMA20 ($${s20.toFixed(2)})`;
      }
    }
    signals.push({ label: 'SMA Trend', direction, reason, score });
  }

  // ── Short-term momentum: 5-bar return vs 20-bar return ──
  if (closes.length >= 21) {
    const ret5 = (lastClose - closes[closes.length - 6]) / closes[closes.length - 6];
    const ret20 = (lastClose - closes[closes.length - 21]) / closes[closes.length - 21];
    const momentum = ret5 - ret20 / 4; // normalize 20-bar by period ratio

    let score: number;
    let direction: Signal['direction'];
    let reason: string;

    if (ret5 >= 0.03 && momentum > 0) {
      score = 0.7; direction = 'bullish';
      reason = `Strong 5-day surge (+${(ret5 * 100).toFixed(1)}%)`;
    } else if (ret5 >= 0.01 && momentum > 0) {
      score = 0.3; direction = 'bullish';
      reason = `Positive short-term momentum (+${(ret5 * 100).toFixed(1)}% / 5d)`;
    } else if (ret5 <= -0.03 && momentum < 0) {
      score = -0.7; direction = 'bearish';
      reason = `Sharp 5-day decline (${(ret5 * 100).toFixed(1)}%)`;
    } else if (ret5 <= -0.01 && momentum < 0) {
      score = -0.3; direction = 'bearish';
      reason = `Negative short-term momentum (${(ret5 * 100).toFixed(1)}% / 5d)`;
    } else {
      score = 0; direction = 'neutral';
      reason = `Flat short-term (${(ret5 * 100).toFixed(1)}% / 5d)`;
    }
    signals.push({ label: 'Momentum', direction, reason, score });
  }

  // ── 52-week position: graded across the full range ──
  if (quote.week52High && quote.week52Low) {
    const range = quote.week52High - quote.week52Low;
    const pos = range > 0 ? (lastClose - quote.week52Low) / range : 0.5;

    let score: number;
    let direction: Signal['direction'];
    let reason: string;

    if (pos >= 0.9) {
      score = -0.7; direction = 'bearish'; reason = `Near 52W high — ${(pos * 100).toFixed(0)}% of range`;
    } else if (pos >= 0.7) {
      score = -0.2; direction = 'bearish'; reason = `Upper 52W range — ${(pos * 100).toFixed(0)}%`;
    } else if (pos >= 0.4 && pos < 0.7) {
      score = 0.2; direction = 'bullish'; reason = `Mid-to-upper 52W range — ${(pos * 100).toFixed(0)}%`;
    } else if (pos >= 0.2) {
      score = 0; direction = 'neutral'; reason = `Mid-to-lower 52W range — ${(pos * 100).toFixed(0)}%`;
    } else if (pos >= 0.1) {
      score = 0.5; direction = 'bullish'; reason = `Near 52W low — ${(pos * 100).toFixed(0)}% of range`;
    } else {
      score = 0.8; direction = 'bullish'; reason = `At/near 52W low — ${(pos * 100).toFixed(0)}% of range`;
    }
    signals.push({ label: '52W Range', direction, reason, score });
  }

  // ── Volume confirmation ──
  if (quote.volume && quote.avgVolume && quote.avgVolume > 0) {
    const ratio = quote.volume / quote.avgVolume;
    if (ratio >= 2.0) {
      const dir = quote.changePercent >= 0 ? 'bullish' : 'bearish';
      const s = quote.changePercent >= 0 ? 0.6 : -0.6;
      signals.push({
        label: `Vol ×${ratio.toFixed(1)}`,
        direction: dir,
        reason: `Heavy volume (${ratio.toFixed(1)}×) confirms ${dir} move`,
        score: s,
      });
    } else if (ratio >= 1.4) {
      const dir = quote.changePercent >= 0 ? 'bullish' : 'bearish';
      const s = quote.changePercent >= 0 ? 0.3 : -0.3;
      signals.push({
        label: `Vol ×${ratio.toFixed(1)}`,
        direction: dir,
        reason: `Above-avg volume (${ratio.toFixed(1)}×) supporting move`,
        score: s,
      });
    }
  }

  return signals;
}

function buildRecommendations(signals: Signal[]): Recommendation[] {
  if (signals.length === 0) return [];

  // Weighted average score across all signals
  const avgScore = signals.reduce((sum, s) => sum + s.score, 0) / signals.length;

  if (avgScore >= 0.45) {
    return [
      {
        strategy: 'Long Call',
        rationale: `Strong bullish bias (score: ${avgScore.toFixed(2)}). A long call provides leveraged upside exposure with defined, capped risk on the downside.`,
        type: 'bullish',
        risk: 'medium',
      },
      {
        strategy: 'Bull Call Spread',
        rationale: 'Reduce net premium vs. a naked long call. Capping upside lowers the breakeven and improves the probability of profit in a moderately bullish move.',
        type: 'bullish',
        risk: 'low',
      },
    ];
  }

  if (avgScore >= 0.15) {
    return [
      {
        strategy: 'Bull Call Spread',
        rationale: `Mild bullish bias (score: ${avgScore.toFixed(2)}). Defined risk/reward spread that profits from a moderate move up without paying full long-call premium.`,
        type: 'bullish',
        risk: 'low',
      },
      {
        strategy: 'Cash-Secured Put',
        rationale: 'Sell an OTM put to collect premium. Bullish lean suggests the stock is unlikely to fall through the strike; worst case you acquire shares at a discount.',
        type: 'bullish',
        risk: 'medium',
      },
    ];
  }

  if (avgScore >= -0.15) {
    return [
      {
        strategy: 'Iron Condor',
        rationale: `Neutral signal mix (score: ${avgScore.toFixed(2)}). Sell both an OTM call spread and an OTM put spread to profit from a range-bound market and IV decay.`,
        type: 'neutral',
        risk: 'low',
      },
      {
        strategy: 'Calendar Spread',
        rationale: 'Sell a near-term option and buy a longer-dated option at the same strike. Benefits from time decay differential when price stays near the strike.',
        type: 'neutral',
        risk: 'low',
      },
    ];
  }

  if (avgScore >= -0.45) {
    return [
      {
        strategy: 'Bear Put Spread',
        rationale: `Mild bearish bias (score: ${avgScore.toFixed(2)}). Defined risk/reward spread that profits from a moderate decline without paying full long-put premium.`,
        type: 'bearish',
        risk: 'low',
      },
      {
        strategy: 'Covered Call',
        rationale: 'If you hold shares, sell an OTM call to generate income. Mild bearish/neutral signals suggest limited near-term upside, making the call premium attractive.',
        type: 'bearish',
        risk: 'low',
      },
    ];
  }

  // avgScore < -0.45
  return [
    {
      strategy: 'Long Put',
      rationale: `Strong bearish bias (score: ${avgScore.toFixed(2)}). A long put provides leveraged downside exposure with defined, capped risk on the upside.`,
      type: 'bearish',
      risk: 'medium',
    },
    {
      strategy: 'Bear Put Spread',
      rationale: 'Reduce net premium vs. a naked long put. Capping downside profit lowers the breakeven and improves probability of profit in a moderately bearish move.',
      type: 'bearish',
      risk: 'low',
    },
  ];
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

  const signals = buildSignals(quote, bars);
  const recs = buildRecommendations(signals);

  const avgScore = signals.length
    ? signals.reduce((s, sig) => s + sig.score, 0) / signals.length
    : 0;

  const sentiment =
    avgScore >= 0.15 ? 'Bullish' : avgScore <= -0.15 ? 'Bearish' : 'Neutral';
  const sentimentClass =
    avgScore >= 0.15 ? 'text-green' : avgScore <= -0.15 ? 'text-red' : 'text-yellow';

  return (
    <div className="trade-recs-card">
      <div className="trade-recs-header">
        <div className="trade-recs-title">Trade Recommendations</div>
        <div className="trade-recs-sentiment">
          Overall: <span className={sentimentClass}>{sentiment}</span>
          <span className="trade-recs-score" title="Composite signal score (−1 bearish → +1 bullish)">
            score {avgScore >= 0 ? '+' : ''}{avgScore.toFixed(2)}
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
