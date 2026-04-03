import type { EconomicEvent } from '../../api/types';

interface Props {
  events: EconomicEvent[];
  unavailable?: boolean;
}

const IMPACT_STYLES = {
  high:   { color: 'var(--color-red)',    label: 'High'   },
  medium: { color: 'var(--color-yellow)', label: 'Med'    },
  low:    { color: 'var(--text-muted)',   label: 'Low'    },
};

function fmtVal(v: number | null | undefined, unit: string | undefined): string {
  if (v === null || v === undefined) return '—';
  const formatted = Math.abs(v) >= 1000
    ? v.toLocaleString('en-US')
    : v % 1 === 0 ? String(v) : v.toFixed(1);
  return unit ? `${formatted}${unit}` : formatted;
}

function fmtTime(utcString: string): string {
  if (!utcString) return '';
  const d = new Date(utcString.includes('T') ? utcString : utcString.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtDayHeader(utcString: string): string {
  if (!utcString) return '';
  const d = new Date(utcString.includes('T') ? utcString : utcString.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();
}

function dateKey(utcString: string): string {
  if (!utcString) return '';
  const d = new Date(utcString.includes('T') ? utcString : utcString.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
}

function isReleased(event: EconomicEvent): boolean {
  return event.actual !== null && event.actual !== undefined;
}

// Group events by ET date
function groupByDate(events: EconomicEvent[]): { key: string; label: string; items: EconomicEvent[] }[] {
  const map = new Map<string, EconomicEvent[]>();
  for (const e of events) {
    const key = dateKey(e.time);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e);
  }
  return Array.from(map.entries()).map(([key, items]) => ({
    key,
    label: fmtDayHeader(items[0].time),
    items,
  }));
}

export default function EconomicCalendar({ events, unavailable }: Props) {
  if (unavailable) {
    return (
      <div className="eco-cal-empty">
        <div className="eco-cal-empty-title">Economic Calendar</div>
        <div className="eco-cal-empty-desc">
          Configure a FRED API key to enable the economic calendar.
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return <div className="eco-cal-empty-desc">No upcoming events found.</div>;
  }

  const groups = groupByDate(events);
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  return (
    <div className="eco-cal-feed">
      {groups.map(group => (
        <div key={group.key} className="eco-cal-group">
          <div className={`eco-cal-date-header${group.key === todayKey ? ' today' : ''}`}>
            {group.label}{group.key === todayKey ? ' — Today' : ''}
          </div>
          {group.items.map((e, i) => {
            const impact = IMPACT_STYLES[e.impact] ?? IMPACT_STYLES.low;
            const released = isReleased(e);
            return (
              <div key={`${e.event}-${i}`} className="eco-cal-event">
                <div className="eco-cal-event-main">
                  <span className="eco-cal-impact-dot" style={{ background: impact.color }} />
                  <div className="eco-cal-event-info">
                    <span className="eco-cal-event-name">{e.event}</span>
                    <span className="eco-cal-event-time">{fmtTime(e.time)} ET</span>
                  </div>
                  <span className="eco-cal-impact-label" style={{ color: impact.color }}>
                    {impact.label}
                  </span>
                </div>
                <div className="eco-cal-event-values">
                  {released && (
                    <span className="eco-cal-val actual">
                      Actual: <strong>{fmtVal(e.actual, e.unit)}</strong>
                    </span>
                  )}
                  {e.estimate !== null && e.estimate !== undefined && (
                    <span className="eco-cal-val">
                      Est: {fmtVal(e.estimate, e.unit)}
                    </span>
                  )}
                  {e.prev !== null && e.prev !== undefined && (
                    <span className="eco-cal-val">
                      Prev: {fmtVal(e.prev, e.unit)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
