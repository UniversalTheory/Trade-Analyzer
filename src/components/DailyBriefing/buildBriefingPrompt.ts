import type {
  QuoteData,
  SectorPerformance,
  MarketContext,
  NewsItem,
  EconomicEvent,
  EarningsData,
} from '../../api/types';
import type { PortfolioPosition } from '../../utils/portfolioStorage';

// Pure prompt assembler. Takes the data slice the briefing UI already has,
// returns the system + userContent strings to send to /api/ai/analyze.

export interface BriefingPromptInputs {
  asOfDate: Date;
  indices: QuoteData[];           // expects ^GSPC, ^IXIC, ^DJI, ^RUT, ^VIX
  sectors: SectorPerformance[];
  marketContext?: MarketContext;
  positions: PortfolioPosition[];
  quotes: Record<string, QuoteData>;
  earnings: Record<string, EarningsData>;
  moverNews: Record<string, NewsItem[]>;
  calendar: EconomicEvent[];
  marketNews: NewsItem[];
}

const SYSTEM = [
  'You are a portfolio-aware market commentator embedded in a personal trading dashboard.',
  'Given a structured snapshot of today\'s markets and the user\'s portfolio, write a brief 2-3 paragraph synthesis in plain, direct language.',
  'Cover: what is driving today\'s tape, the most relevant signal or risk for THIS portfolio (refer to specific tickers), and one thing to watch in the next several days.',
  'No bullet lists, no headings, no preamble like "Here is" or "Today\'s commentary". Begin directly with the analysis.',
  'Do not invent data — only use what is provided. If the portfolio is empty, focus only on broad market color.',
  'Be specific, not vague. Avoid hedge phrases ("could", "might", "may") unless the underlying data genuinely warrants them.',
].join(' ');

const INDEX_LABEL: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^IXIC': 'Nasdaq',
  '^DJI': 'Dow',
  '^RUT': 'Russell 2000',
};

function fmtSigned(pct: number, digits = 2): string {
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(digits)}%`;
}

function fmtPrice(p: number): string {
  if (p >= 10000) return Math.round(p).toLocaleString('en-US');
  if (p >= 1000) return Math.round(p).toLocaleString('en-US');
  return p.toFixed(2);
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}

function daysBetween(isoDate: string, ref: Date): number {
  const target = new Date(isoDate + 'T00:00:00');
  const ms = target.getTime() - new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  return Math.round(ms / 86400000);
}

export function buildBriefingPrompt(i: BriefingPromptInputs): { system: string; userContent: string } {
  const lines: string[] = [];
  lines.push(`Date: ${i.asOfDate.toISOString().slice(0, 10)}`);
  lines.push('');

  // Market snapshot
  lines.push('Market:');
  for (const sym of ['^GSPC', '^IXIC', '^DJI', '^RUT']) {
    const q = i.indices.find(x => x.symbol === sym);
    if (q) lines.push(`  ${INDEX_LABEL[sym]}: ${fmtPrice(q.price)} (${fmtSigned(q.changePercent)})`);
  }
  const vix = i.indices.find(x => x.symbol === '^VIX');
  if (vix) {
    const band = vix.price < 15 ? 'low fear' : vix.price < 20 ? 'normal' : vix.price < 30 ? 'elevated' : 'high fear';
    lines.push(`  VIX: ${vix.price.toFixed(2)} (${band})`);
  }
  if (i.marketContext) {
    const mc = i.marketContext;
    const parts: string[] = [];
    if (mc.vixBand) parts.push(`VIX ${mc.vixBand}`);
    if (mc.sectorDispersion != null) parts.push(`dispersion ${mc.sectorDispersion.toFixed(2)}pp`);
    if (mc.sectorBreadth50d != null) parts.push(`${(mc.sectorBreadth50d * 100).toFixed(0)}% of sectors above 50d SMA`);
    if (parts.length > 0) lines.push(`  Regime: ${parts.join(', ')}`);
  }

  // Sectors
  const sectorSorted = i.sectors.slice().sort((a, b) => b.changePercent1D - a.changePercent1D);
  const top3 = sectorSorted.slice(0, 3);
  const bot3 = sectorSorted.slice(-3).reverse();
  if (top3.length > 0) {
    lines.push(`  Sector leaders: ${top3.map(s => `${s.sector} ${fmtSigned(s.changePercent1D)}`).join(', ')}`);
    lines.push(`  Sector laggards: ${bot3.map(s => `${s.sector} ${fmtSigned(s.changePercent1D)}`).join(', ')}`);
  }
  lines.push('');

  // Portfolio
  if (i.positions.length === 0) {
    lines.push('Portfolio: (none — user has not added positions yet)');
  } else {
    let dayPl = 0;
    let previousValue = 0;
    let priced = 0;
    for (const p of i.positions) {
      const q = i.quotes[p.symbol];
      if (!q || q.previousClose <= 0) continue;
      dayPl += p.shares * (q.price - q.previousClose);
      previousValue += p.shares * q.previousClose;
      priced += 1;
    }
    const dayPct = previousValue > 0 ? (dayPl / previousValue) * 100 : 0;
    lines.push(`Portfolio (${i.positions.length} positions, ${priced} priced):`);
    lines.push(`  Day P/L: ${dayPl >= 0 ? '+' : '-'}$${fmtUsd(Math.abs(dayPl))} (${fmtSigned(dayPct)}) on $${fmtUsd(previousValue)} prior-close value`);

    // Movers ranked by USD contribution
    const movers = i.positions
      .map(p => {
        const q = i.quotes[p.symbol];
        if (!q || q.previousClose <= 0) return null;
        return {
          sym: p.symbol,
          contribution: p.shares * (q.price - q.previousClose),
          pct: q.changePercent,
        };
      })
      .filter((m): m is { sym: string; contribution: number; pct: number } => !!m)
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 5);
    if (movers.length > 0) {
      lines.push('  Top movers by USD impact:');
      for (const m of movers) {
        const sign = m.contribution >= 0 ? '+' : '-';
        lines.push(`    ${m.sym}: ${fmtSigned(m.pct)} (${sign}$${fmtUsd(Math.abs(m.contribution))})`);
      }
    }

    // Alerts
    const alerts: string[] = [];
    for (const p of i.positions) {
      const q = i.quotes[p.symbol];
      if (!q) continue;
      if (q.avgVolume && q.avgVolume > 0 && q.volume / q.avgVolume >= 1.5) {
        alerts.push(`${p.symbol} ${(q.volume / q.avgVolume).toFixed(1)}× avg volume`);
      }
      if (q.week52High && q.price >= q.week52High * 0.995) {
        alerts.push(`${p.symbol} at/near 52w high`);
      } else if (q.week52Low && q.price <= q.week52Low * 1.005 && q.week52Low > 0) {
        alerts.push(`${p.symbol} at/near 52w low`);
      }
      if (Math.abs(q.changePercent) >= 3) {
        alerts.push(`${p.symbol} ${fmtSigned(q.changePercent)} intraday`);
      }
    }
    if (alerts.length > 0) lines.push(`  Activity alerts: ${alerts.join('; ')}`);

    // Upcoming earnings (next 14d)
    const upcoming: { sym: string; date: string; days: number; callTime?: string }[] = [];
    for (const p of i.positions) {
      const e = i.earnings[p.symbol];
      if (!e?.nextEarningsDate) continue;
      const days = daysBetween(e.nextEarningsDate, i.asOfDate);
      if (days < 0 || days > 14) continue;
      upcoming.push({ sym: p.symbol, date: e.nextEarningsDate, days, callTime: e.earningsCallTime });
    }
    upcoming.sort((a, b) => a.days - b.days);
    if (upcoming.length > 0) {
      const formatted = upcoming.slice(0, 5).map(u => {
        const ct = u.callTime === 'bmo' ? ' BMO' : u.callTime === 'amc' ? ' AMC' : '';
        return `${u.sym} in ${u.days}d (${u.date}${ct})`;
      });
      lines.push(`  Upcoming earnings (≤14d): ${formatted.join(', ')}`);
    }
  }
  lines.push('');

  // Mover news (1-2 headlines per top mover)
  const moverNewsLines: string[] = [];
  for (const [sym, items] of Object.entries(i.moverNews)) {
    for (const n of items.slice(0, 2)) {
      moverNewsLines.push(`  ${sym}: "${n.headline.slice(0, 140)}" (${n.source})`);
    }
  }
  if (moverNewsLines.length > 0) {
    lines.push('Headlines on portfolio movers:');
    lines.push(...moverNewsLines.slice(0, 8));
    lines.push('');
  }

  // Broad market headlines
  if (i.marketNews.length > 0) {
    lines.push('Market headlines:');
    for (const n of i.marketNews.slice(0, 5)) {
      lines.push(`  "${n.headline.slice(0, 140)}" (${n.source})`);
    }
    lines.push('');
  }

  // Economic calendar (high+medium only, next 7d)
  if (i.calendar.length > 0) {
    const ref = i.asOfDate;
    const upcoming = i.calendar
      .filter(e => e.impact === 'high' || e.impact === 'medium')
      .filter(e => {
        const d = daysBetween(e.time.slice(0, 10), ref);
        return d >= 0 && d <= 7;
      })
      .slice(0, 8);
    if (upcoming.length > 0) {
      lines.push('Economic calendar (next 7d, high+medium impact):');
      for (const e of upcoming) {
        const d = daysBetween(e.time.slice(0, 10), ref);
        const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : `${d}d`;
        lines.push(`  ${e.event} (${e.country}, ${e.impact}) — ${when}`);
      }
    }
  }

  return {
    system: SYSTEM,
    userContent: lines.join('\n'),
  };
}
