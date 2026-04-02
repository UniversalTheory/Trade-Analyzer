import type { QuoteData } from '../../api/types';
import LoadingState from '../common/LoadingState';

interface Props {
  quotes: QuoteData[];
  loading: boolean;
}

interface ExchangeMeta {
  name: string;
  city: string;
  timezone: string;
  openHour: number;
  openMin: number;
  closeHour: number;
  closeMin: number;
  region: 'europe' | 'asia';
}

const EXCHANGE_META: Record<string, ExchangeMeta> = {
  '^FTSE':     { name: 'FTSE 100',      city: 'London',    timezone: 'Europe/London',    openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30, region: 'europe' },
  '^GDAXI':    { name: 'DAX',           city: 'Frankfurt', timezone: 'Europe/Berlin',    openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, region: 'europe' },
  '^FCHI':     { name: 'CAC 40',        city: 'Paris',     timezone: 'Europe/Paris',     openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, region: 'europe' },
  '^STOXX50E': { name: 'Euro Stoxx 50', city: 'Frankfurt', timezone: 'Europe/Berlin',    openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, region: 'europe' },
  '^N225':     { name: 'Nikkei 225',    city: 'Tokyo',     timezone: 'Asia/Tokyo',       openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, region: 'asia'   },
  '^HSI':      { name: 'Hang Seng',     city: 'Hong Kong', timezone: 'Asia/Hong_Kong',   openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  region: 'asia'   },
  '000001.SS': { name: 'Shanghai Comp', city: 'Shanghai',  timezone: 'Asia/Shanghai',    openHour: 9,  openMin: 30, closeHour: 15, closeMin: 0,  region: 'asia'   },
  '^AXJO':     { name: 'ASX 200',       city: 'Sydney',    timezone: 'Australia/Sydney', openHour: 10, openMin: 0,  closeHour: 16, closeMin: 10, region: 'asia'   },
};

function getMarketStatus(meta: ExchangeMeta): { open: boolean; localTime: string } {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: meta.timezone,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0');

  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const nowMins = hour * 60 + minute;
  const openMins = meta.openHour * 60 + meta.openMin;
  const closeMins = meta.closeHour * 60 + meta.closeMin;
  const open = !isWeekend && nowMins >= openMins && nowMins < closeMins;

  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: meta.timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);

  return { open, localTime };
}

function fmt(price: number): string {
  return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function IndexRow({ q }: { q: QuoteData }) {
  const meta = EXCHANGE_META[q.symbol];
  if (!meta) return null;
  const { open, localTime } = getMarketStatus(meta);
  const up = q.changePercent >= 0;
  const color = up ? 'var(--color-green)' : 'var(--color-red)';

  return (
    <div className="global-table-row">
      <div className="global-row-name">
        <span className="global-row-label">{meta.name}</span>
        <span className="global-row-sub">
          <span className={`market-status-dot ${open ? 'open' : 'closed'}`} />
          {open ? 'Open' : 'Closed'} · {localTime}
        </span>
      </div>
      <span className="global-row-price ta-right">{fmt(q.price)}</span>
      <span className="global-row-change ta-right" style={{ color }}>
        {up ? '+' : ''}{q.changePercent.toFixed(2)}%
      </span>
    </div>
  );
}

export default function InternationalPanel({ quotes, loading }: Props) {
  const europe = quotes.filter(q => EXCHANGE_META[q.symbol]?.region === 'europe');
  const asia   = quotes.filter(q => EXCHANGE_META[q.symbol]?.region === 'asia');

  return (
    <div className="global-panel">
      <div className="global-panel-header">
        <span className="global-panel-title">International</span>
        <span className="global-panel-subtitle">Major Indices</span>
      </div>

      {loading && quotes.length === 0 ? (
        <LoadingState rows={8} height={18} />
      ) : (
        <div className="global-table">
          <div className="global-table-head">
            <span>Index</span>
            <span className="ta-right">Price</span>
            <span className="ta-right">Chg%</span>
          </div>

          <div className="global-region-label">Europe</div>
          {europe.map(q => <IndexRow key={q.symbol} q={q} />)}

          <div className="global-region-label global-region-label--gap">Asia-Pacific</div>
          {asia.map(q => <IndexRow key={q.symbol} q={q} />)}
        </div>
      )}
    </div>
  );
}
