import { useApi } from '../../hooks/useApi';
import { market } from '../../api/client';
import type { QuoteData, SectorPerformance } from '../../api/types';

interface Props {
  refreshKey: number;
}

const INDEX_LABEL: Record<string, string> = {
  '^GSPC': 'S&P',
  '^IXIC': 'Nasdaq',
  '^DJI':  'Dow',
  '^RUT':  'Russell',
};

const INDEX_ORDER = ['^GSPC', '^IXIC', '^DJI', '^RUT'];

function vixBand(price: number): { label: string; color: string } {
  if (price < 15) return { label: 'Low Fear', color: 'var(--color-green)' };
  if (price < 20) return { label: 'Normal',   color: 'var(--color-blue)' };
  if (price < 30) return { label: 'Elevated', color: 'var(--color-yellow)' };
  return { label: 'High Fear', color: 'var(--color-red)' };
}

function fmtPrice(p: number): string {
  if (p >= 10000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1000)  return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return p.toFixed(2);
}

export default function MarketPulse({ refreshKey }: Props) {
  const indices = useApi<QuoteData[]>(() => market.getIndices(), [refreshKey]);
  const sectors = useApi<SectorPerformance[]>(() => market.getSectors(), [refreshKey]);

  if ((indices.loading && !indices.data) || (sectors.loading && !sectors.data)) {
    return <div className="market-pulse market-pulse-loading">Loading market pulse…</div>;
  }

  const indexQuotes = INDEX_ORDER
    .map(sym => indices.data?.find(q => q.symbol === sym))
    .filter((q): q is QuoteData => !!q);
  const vix = indices.data?.find(q => q.symbol === '^VIX');
  const vixInfo = vix ? vixBand(vix.price) : null;

  const sortedSectors = (sectors.data ?? [])
    .slice()
    .sort((a, b) => b.changePercent1D - a.changePercent1D);
  const leader = sortedSectors[0];
  const laggard = sortedSectors[sortedSectors.length - 1];

  return (
    <div className="market-pulse">
      {indexQuotes.map(q => {
        const up = q.changePercent >= 0;
        return (
          <span key={q.symbol} className="market-pulse-item">
            <span className="market-pulse-label">{INDEX_LABEL[q.symbol] ?? q.symbol}</span>
            <span className="market-pulse-value">{fmtPrice(q.price)}</span>
            <span className="market-pulse-pct" style={{ color: up ? 'var(--color-green)' : 'var(--color-red)' }}>
              {up ? '+' : ''}{q.changePercent.toFixed(2)}%
            </span>
          </span>
        );
      })}

      {vix && vixInfo && (
        <span className="market-pulse-item">
          <span className="market-pulse-label">VIX</span>
          <span className="market-pulse-value">{vix.price.toFixed(2)}</span>
          <span className="market-pulse-vix-band" style={{ color: vixInfo.color, borderColor: vixInfo.color }}>
            {vixInfo.label}
          </span>
        </span>
      )}

      {leader && leader.changePercent1D > 0 && (
        <span className="market-pulse-item market-pulse-rotation">
          <span className="market-pulse-arrow up">▲</span>
          <span className="market-pulse-label">{leader.sector}</span>
          <span className="market-pulse-pct" style={{ color: 'var(--color-green)' }}>
            +{leader.changePercent1D.toFixed(2)}%
          </span>
        </span>
      )}

      {laggard && laggard.changePercent1D < 0 && (
        <span className="market-pulse-item market-pulse-rotation">
          <span className="market-pulse-arrow down">▼</span>
          <span className="market-pulse-label">{laggard.sector}</span>
          <span className="market-pulse-pct" style={{ color: 'var(--color-red)' }}>
            {laggard.changePercent1D.toFixed(2)}%
          </span>
        </span>
      )}
    </div>
  );
}
