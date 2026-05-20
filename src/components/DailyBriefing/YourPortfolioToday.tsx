import { useEffect, useMemo, useState } from 'react';
import { ticker } from '../../api/client';
import { loadPortfolio } from '../../utils/portfolioStorage';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import type { QuoteData, EarningsData, NewsItem } from '../../api/types';
import { computePortfolioDayTotals, fmtUSD, fmtPct, signed } from '../../utils/portfolioCalc';
import LoadingState from '../common/LoadingState';
import PortfolioNewsFeed from './PortfolioNewsFeed';

interface Props {
  refreshKey: number;
  onShowInResearch?: (symbol: string) => void;
}

interface PositionDayChange {
  position: PortfolioPosition;
  quote: QuoteData;
  contribution: number;
  changePct: number;
}

interface UpcomingEarnings {
  symbol: string;
  date: string;
  daysUntil: number;
  callTime?: string;
}

type Alert =
  | { type: 'heavy_volume'; symbol: string; ratio: number }
  | { type: 'new_52w_high'; symbol: string }
  | { type: 'new_52w_low';  symbol: string }
  | { type: 'big_move';     symbol: string; pct: number };

const EARNINGS_WINDOW_DAYS = 14;
const ALERT_VOLUME_RATIO = 1.5;
const ALERT_52W_TOLERANCE = 0.005;     // within 0.5% of 52w extreme
const ALERT_BIG_MOVE_PCT = 3.0;        // absolute % threshold
const MAX_NEWS_PER_MOVER = 2;

function daysBetween(isoDate: string, ref: Date = new Date()): number {
  const target = new Date(isoDate + 'T00:00:00');
  const ms = target.getTime() - new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  return Math.round(ms / 86400000);
}

function fmtEarningsDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function callTimeLabel(t?: string): string {
  if (!t) return '';
  if (t === 'bmo') return 'BMO';
  if (t === 'amc') return 'AMC';
  return '';
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function deriveAlerts(
  positions: PortfolioPosition[],
  quotes: Record<string, QuoteData>,
): Alert[] {
  const out: Alert[] = [];
  for (const p of positions) {
    const q = quotes[p.symbol];
    if (!q) continue;

    if (q.avgVolume && q.avgVolume > 0) {
      const ratio = q.volume / q.avgVolume;
      if (ratio >= ALERT_VOLUME_RATIO) {
        out.push({ type: 'heavy_volume', symbol: p.symbol, ratio });
      }
    }

    if (q.week52High && q.price >= q.week52High * (1 - ALERT_52W_TOLERANCE)) {
      out.push({ type: 'new_52w_high', symbol: p.symbol });
    } else if (q.week52Low && q.price <= q.week52Low * (1 + ALERT_52W_TOLERANCE) && q.week52Low > 0) {
      out.push({ type: 'new_52w_low', symbol: p.symbol });
    }

    if (Math.abs(q.changePercent) >= ALERT_BIG_MOVE_PCT) {
      out.push({ type: 'big_move', symbol: p.symbol, pct: q.changePercent });
    }
  }
  return out;
}

export default function YourPortfolioToday({ refreshKey, onShowInResearch }: Props) {
  const [positions] = useState<PortfolioPosition[]>(() => loadPortfolio().positions);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [earnings, setEarnings] = useState<Record<string, EarningsData>>({});
  const [newsByMover, setNewsByMover] = useState<Record<string, NewsItem[]>>({});
  const [loading, setLoading] = useState<boolean>(positions.length > 0);

  const symbolsKey = positions.map(p => p.symbol).join(',');

  useEffect(() => {
    if (positions.length === 0) {
      setQuotes({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(
      positions.map(p => ticker.getQuote(p.symbol).then(q => ({ sym: p.symbol, q }))),
    ).then(results => {
      if (cancelled) return;
      const next: Record<string, QuoteData> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') next[r.value.sym] = r.value.q;
      }
      setQuotes(next);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [symbolsKey, refreshKey]);

  useEffect(() => {
    if (positions.length === 0) {
      setEarnings({});
      return;
    }
    let cancelled = false;
    Promise.allSettled(
      positions.map(p =>
        ticker.getEarnings(p.symbol)
          .then(e => ({ sym: p.symbol, e }))
          .catch(() => ({ sym: p.symbol, e: null as EarningsData | null })),
      ),
    ).then(results => {
      if (cancelled) return;
      const next: Record<string, EarningsData> = {};
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.e) next[r.value.sym] = r.value.e;
      }
      setEarnings(next);
    });
    return () => { cancelled = true; };
  }, [symbolsKey, refreshKey]);

  const dayTotals = useMemo(() => computePortfolioDayTotals(positions, quotes), [positions, quotes]);
  const dayColor = dayTotals.pl >= 0 ? 'var(--color-green)' : 'var(--color-red)';

  const movers: PositionDayChange[] = useMemo(() => {
    const rows: PositionDayChange[] = [];
    for (const p of positions) {
      const q = quotes[p.symbol];
      if (!q || q.previousClose <= 0) continue;
      rows.push({
        position: p,
        quote: q,
        contribution: p.shares * (q.price - q.previousClose),
        changePct: q.changePercent,
      });
    }
    rows.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
    return rows.slice(0, 5);
  }, [positions, quotes]);

  const moverSymbolsKey = movers.map(m => m.position.symbol).join(',');

  // Fetch news headlines for top movers (only).
  useEffect(() => {
    if (movers.length === 0) {
      setNewsByMover({});
      return;
    }
    let cancelled = false;
    Promise.allSettled(
      movers.map(m =>
        ticker.getNews(m.position.symbol)
          .then(news => ({ sym: m.position.symbol, news }))
          .catch(() => ({ sym: m.position.symbol, news: [] as NewsItem[] })),
      ),
    ).then(results => {
      if (cancelled) return;
      const next: Record<string, NewsItem[]> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') {
          next[r.value.sym] = (r.value.news ?? []).slice(0, MAX_NEWS_PER_MOVER);
        }
      }
      setNewsByMover(next);
    });
    return () => { cancelled = true; };
  }, [moverSymbolsKey, refreshKey]);

  const alerts = useMemo(() => deriveAlerts(positions, quotes), [positions, quotes]);

  const upcoming: UpcomingEarnings[] = useMemo(() => {
    const out: UpcomingEarnings[] = [];
    for (const p of positions) {
      const e = earnings[p.symbol];
      if (!e?.nextEarningsDate) continue;
      const days = daysBetween(e.nextEarningsDate);
      if (days < 0 || days > EARNINGS_WINDOW_DAYS) continue;
      out.push({
        symbol: p.symbol,
        date: e.nextEarningsDate,
        daysUntil: days,
        callTime: e.earningsCallTime,
      });
    }
    out.sort((a, b) => a.daysUntil - b.daysUntil);
    return out;
  }, [positions, earnings]);

  if (positions.length === 0) {
    return (
      <section className="panel-card briefing-section">
        <div className="briefing-section-header">
          <h3 className="briefing-section-title">Your Portfolio Today</h3>
        </div>
        <div className="briefing-empty-state">
          Add positions in the <strong>Portfolio</strong> tab to see your daily P/L,
          activity alerts, top movers with news, and upcoming catalysts here.
        </div>
      </section>
    );
  }

  return (
    <section className="panel-card briefing-section">
      <div className="briefing-section-header">
        <h3 className="briefing-section-title">Your Portfolio Today</h3>
        {dayTotals.pricedCount > 0 && dayTotals.previousValue > 0 && (
          <span className="briefing-day-pl-summary" style={{ color: dayColor }}>
            {signed(dayTotals.pl)}${fmtUSD(Math.abs(dayTotals.pl))}
            {' '}({signed(dayTotals.pl)}{fmtPct(dayTotals.plPct)})
          </span>
        )}
      </div>

      {loading && Object.keys(quotes).length === 0 ? (
        <LoadingState rows={3} height={22} />
      ) : (
        <>
          {alerts.length > 0 && <AlertsBlock alerts={alerts} onShowInResearch={onShowInResearch} />}

          <div className="briefing-portfolio-grid">
            <div>
              <div className="briefing-mini-heading">
                Top movers today
                <span className="briefing-mini-meta"> · ranked by USD impact on portfolio</span>
              </div>
              {movers.length === 0 && (
                <div className="briefing-empty-line">Waiting for quotes…</div>
              )}
              {movers.map(m => (
                <MoverBlock
                  key={m.position.id}
                  mover={m}
                  news={newsByMover[m.position.symbol] ?? []}
                  onShowInResearch={onShowInResearch}
                />
              ))}
            </div>

            <PortfolioNewsFeed
              positions={positions}
              refreshKey={refreshKey}
              onShowInResearch={onShowInResearch}
            />
          </div>

          <div className="briefing-portfolio-earnings">
            <div className="briefing-mini-heading">
              Upcoming earnings <span className="briefing-mini-meta">· next {EARNINGS_WINDOW_DAYS}d</span>
            </div>
            {upcoming.length === 0 ? (
              <div className="briefing-empty-line">No earnings in your portfolio this window.</div>
            ) : (
              <div className="briefing-earnings-grid">
                {upcoming.map(u => (
                  <EarningsRow key={u.symbol} item={u} onShowInResearch={onShowInResearch} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function AlertsBlock({
  alerts,
  onShowInResearch,
}: {
  alerts: Alert[];
  onShowInResearch?: (symbol: string) => void;
}) {
  return (
    <div className="briefing-alerts">
      <div className="briefing-mini-heading">Activity alerts</div>
      <div className="briefing-alert-chips">
        {alerts.map((a, i) => (
          <AlertChip key={`${a.type}-${a.symbol}-${i}`} alert={a} onShowInResearch={onShowInResearch} />
        ))}
      </div>
    </div>
  );
}

function AlertChip({
  alert,
  onShowInResearch,
}: {
  alert: Alert;
  onShowInResearch?: (symbol: string) => void;
}) {
  const clickable = !!onShowInResearch;
  let className = 'briefing-alert-chip';
  let content: React.ReactNode;
  switch (alert.type) {
    case 'heavy_volume':
      className += ' alert-volume';
      content = <><strong>{alert.symbol}</strong> {alert.ratio.toFixed(1)}× vol</>;
      break;
    case 'new_52w_high':
      className += ' alert-high';
      content = <><strong>{alert.symbol}</strong> at 52w high</>;
      break;
    case 'new_52w_low':
      className += ' alert-low';
      content = <><strong>{alert.symbol}</strong> at 52w low</>;
      break;
    case 'big_move': {
      className += alert.pct >= 0 ? ' alert-up' : ' alert-down';
      const sign = alert.pct >= 0 ? '+' : '';
      content = <><strong>{alert.symbol}</strong> {sign}{alert.pct.toFixed(2)}%</>;
      break;
    }
  }
  return (
    <span
      className={`${className}${clickable ? ' clickable' : ''}`}
      onClick={clickable ? () => onShowInResearch!(alert.symbol) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable
        ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowInResearch!(alert.symbol); } }
        : undefined}
    >
      {content}
    </span>
  );
}

function MoverBlock({
  mover,
  news,
  onShowInResearch,
}: {
  mover: PositionDayChange;
  news: NewsItem[];
  onShowInResearch?: (symbol: string) => void;
}) {
  const up = mover.contribution >= 0;
  const color = up ? 'var(--color-green)' : 'var(--color-red)';
  const clickable = !!onShowInResearch;
  return (
    <div className="briefing-mover-block">
      <div
        className={`briefing-portfolio-row${clickable ? ' clickable-asset-row' : ''}`}
        onClick={clickable ? () => onShowInResearch!(mover.position.symbol) : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={clickable
          ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowInResearch!(mover.position.symbol); } }
          : undefined}
      >
        <span className="briefing-portfolio-sym">{mover.position.symbol}</span>
        <span className="briefing-portfolio-change" style={{ color }}>
          {up ? '+' : ''}{mover.changePct.toFixed(2)}%
        </span>
        <span className="briefing-portfolio-contrib" style={{ color }}>
          {signed(mover.contribution)}${fmtUSD(Math.abs(mover.contribution))}
        </span>
      </div>
      {news.length > 0 && (
        <ul className="briefing-mover-news">
          {news.map(n => (
            <li key={n.id} className="briefing-mover-news-item">
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="briefing-mover-news-link"
                onClick={e => e.stopPropagation()}
                title={n.headline}
              >
                {n.headline}
              </a>
              <span className="briefing-mover-news-meta">
                {n.source} · {timeAgo(n.datetime)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EarningsRow({
  item,
  onShowInResearch,
}: {
  item: UpcomingEarnings;
  onShowInResearch?: (symbol: string) => void;
}) {
  const callT = callTimeLabel(item.callTime);
  const clickable = !!onShowInResearch;
  const urgent = item.daysUntil <= 3;
  return (
    <div
      className={`briefing-portfolio-row${clickable ? ' clickable-asset-row' : ''}`}
      onClick={clickable ? () => onShowInResearch!(item.symbol) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable
        ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShowInResearch!(item.symbol); } }
        : undefined}
    >
      <span className="briefing-portfolio-sym">{item.symbol}</span>
      <span className="briefing-portfolio-date">
        {fmtEarningsDate(item.date)}
        {callT && <span className="briefing-call-time"> · {callT}</span>}
      </span>
      <span className={`briefing-portfolio-countdown${urgent ? ' urgent' : ''}`}>
        {item.daysUntil === 0 ? 'Today' : item.daysUntil === 1 ? 'Tomorrow' : `${item.daysUntil}d`}
      </span>
    </div>
  );
}
