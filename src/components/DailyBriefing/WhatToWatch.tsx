import { useApi } from '../../hooks/useApi';
import { market } from '../../api/client';
import type { EconomicEvent } from '../../api/types';
import LoadingState from '../common/LoadingState';

interface Props {
  refreshKey: number;
}

const WATCH_WINDOW_DAYS = 7;
const MAX_EVENTS = 8;

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

  if (calendar.loading && !calendar.data) {
    return (
      <section className="panel-card briefing-section">
        <div className="briefing-section-header">
          <h3 className="briefing-section-title">What to Watch</h3>
        </div>
        <LoadingState rows={3} height={22} />
      </section>
    );
  }

  if (calendar.data?.unavailable) {
    return (
      <section className="panel-card briefing-section">
        <div className="briefing-section-header">
          <h3 className="briefing-section-title">What to Watch</h3>
        </div>
        <div className="briefing-empty-state">
          Configure a FRED API key to enable the economic calendar.
        </div>
      </section>
    );
  }

  const now = Date.now();
  const cutoff = now + WATCH_WINDOW_DAYS * 86400 * 1000;
  const events = (calendar.data?.events ?? [])
    .map(e => ({ e, t: parseEventTime(e.time) }))
    .filter(x => x.t && x.t.getTime() >= now && x.t.getTime() <= cutoff)
    .filter(x => x.e.impact !== 'low')
    .sort((a, b) => a.t!.getTime() - b.t!.getTime())
    .slice(0, MAX_EVENTS);

  return (
    <section className="panel-card briefing-section">
      <div className="briefing-section-header">
        <h3 className="briefing-section-title">What to Watch</h3>
        <span className="briefing-mini-meta">High &amp; medium impact · next {WATCH_WINDOW_DAYS}d</span>
      </div>

      {events.length === 0 ? (
        <div className="briefing-empty-line">
          No high or medium impact economic events in the next {WATCH_WINDOW_DAYS} days.
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
      )}
    </section>
  );
}
