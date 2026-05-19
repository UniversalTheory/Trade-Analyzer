import { useApi } from '../../hooks/useApi';
import { market } from '../../api/client';
import type { EconomicEvent, NewsItem } from '../../api/types';
import LoadingState from '../common/LoadingState';

interface Props {
  refreshKey: number;
}

const WATCH_WINDOW_DAYS = 7;
const MAX_EVENTS = 8;
const MAX_NEWS = 8;

function parseEventTime(utcString: string): Date | null {
  if (!utcString) return null;
  const d = new Date(utcString.includes('T') ? utcString : utcString.replace(' ', 'T') + 'Z');
  return isNaN(d.getTime()) ? null : d;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const IMPACT_COLOR: Record<EconomicEvent['impact'], string> = {
  high:   'var(--color-red)',
  medium: 'var(--color-yellow)',
  low:    'var(--text-muted)',
};

const IMPACT_LABEL: Record<EconomicEvent['impact'], string> = {
  high:   'High',
  medium: 'Med',
  low:    'Low',
};

export default function WhatToWatch({ refreshKey }: Props) {
  const calendar = useApi<{ events: EconomicEvent[]; unavailable?: boolean }>(
    () => market.getCalendar(),
    [refreshKey],
  );
  const news = useApi<NewsItem[]>(() => market.getNews(), [refreshKey]);

  return (
    <section className="panel-card briefing-section">
      <div className="briefing-section-header">
        <h3 className="briefing-section-title">What to Watch</h3>
      </div>

      <div className="briefing-watch-grid">
        <EconomicEventsColumn calendar={calendar} />
        <OtherMarketNewsColumn news={news} />
      </div>
    </section>
  );
}

function EconomicEventsColumn({
  calendar,
}: {
  calendar: ReturnType<typeof useApi<{ events: EconomicEvent[]; unavailable?: boolean }>>;
}) {
  let body: React.ReactNode;
  if (calendar.loading && !calendar.data) {
    body = <LoadingState rows={3} height={22} />;
  } else if (calendar.data?.unavailable) {
    body = (
      <div className="briefing-empty-state">
        Configure a FRED API key to enable the economic calendar.
      </div>
    );
  } else {
    const now = Date.now();
    const cutoff = now + WATCH_WINDOW_DAYS * 86400 * 1000;
    const events = (calendar.data?.events ?? [])
      .map(e => ({ e, t: parseEventTime(e.time) }))
      .filter(x => x.t && x.t.getTime() >= now && x.t.getTime() <= cutoff)
      .filter(x => x.e.impact !== 'low')
      .sort((a, b) => a.t!.getTime() - b.t!.getTime())
      .slice(0, MAX_EVENTS);

    body = events.length === 0 ? (
      <div className="briefing-empty-line">
        No high or medium impact events in the next {WATCH_WINDOW_DAYS} days.
      </div>
    ) : (
      <div className="briefing-watch-list">
        {events.map(({ e, t }) => (
          <div className="briefing-watch-row" key={`${e.time}-${e.event}`}>
            <span
              className="briefing-watch-impact"
              style={{ color: IMPACT_COLOR[e.impact], borderColor: IMPACT_COLOR[e.impact] }}
            >
              {IMPACT_LABEL[e.impact]}
            </span>
            <span className="briefing-watch-when">
              <span className="briefing-watch-day">{fmtDay(t!)}</span>
              <span className="briefing-watch-time">{fmtTime(t!)} ET</span>
            </span>
            <span className="briefing-watch-event">{e.event}</span>
            {e.country && <span className="briefing-watch-country">{e.country}</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="briefing-watch-col">
      <div className="briefing-mini-heading">
        Economic Events
        <span className="briefing-mini-meta"> · next {WATCH_WINDOW_DAYS}d · high &amp; medium impact</span>
      </div>
      {body}
    </div>
  );
}

function OtherMarketNewsColumn({
  news,
}: {
  news: ReturnType<typeof useApi<NewsItem[]>>;
}) {
  let body: React.ReactNode;
  if (news.loading && !news.data) {
    body = <LoadingState rows={3} height={22} />;
  } else if (news.error) {
    body = <div className="briefing-empty-state">Could not load market news.</div>;
  } else {
    const items = (news.data ?? []).slice(0, MAX_NEWS);
    body = items.length === 0 ? (
      <div className="briefing-empty-line">No recent market news.</div>
    ) : (
      <ul className="briefing-news-list">
        {items.map(n => (
          <li key={n.id} className="briefing-news-row briefing-news-row-compact">
            <div className="briefing-news-body">
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="briefing-news-headline"
              >
                {n.headline}
              </a>
              <span className="briefing-news-meta">
                {n.source} · {timeAgo(n.datetime)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="briefing-watch-col">
      <div className="briefing-mini-heading">
        Other Market News
        <span className="briefing-mini-meta"> · top {MAX_NEWS}</span>
      </div>
      {body}
    </div>
  );
}
