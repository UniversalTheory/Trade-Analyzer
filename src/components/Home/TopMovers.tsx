import type { MoverData, MoverItem } from '../../api/types';

interface Props {
  data: MoverData;
}

function MoverRow({ item, type }: { item: MoverItem; type: 'gainer' | 'loser' }) {
  const color = type === 'gainer' ? 'var(--color-green)' : 'var(--color-red)';
  const vol = item.volume >= 1e6
    ? `${(item.volume / 1e6).toFixed(1)}M`
    : item.volume >= 1e3
    ? `${(item.volume / 1e3).toFixed(0)}K`
    : item.volume.toString();

  return (
    <div className="mover-row">
      <div className="mover-info">
        <span className="mover-symbol">{item.symbol}</span>
        <span className="mover-name">{item.name.length > 22 ? item.name.slice(0, 22) + '…' : item.name}</span>
      </div>
      <div className="mover-right">
        <span className="mover-price">${item.price.toFixed(2)}</span>
        <span className="mover-change" style={{ color }}>
          {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
        </span>
        <span className="mover-vol">{vol}</span>
      </div>
    </div>
  );
}

export default function TopMovers({ data }: Props) {
  return (
    <div className="movers-panel">
      <div className="section-heading">Top Movers</div>
      <div className="movers-grid">
        <div className="movers-col">
          <div className="movers-col-header gainers">▲ Gainers</div>
          {data.gainers.length === 0 ? (
            <div className="movers-empty">No data available</div>
          ) : (
            data.gainers.slice(0, 8).map(item => (
              <MoverRow key={item.symbol} item={item} type="gainer" />
            ))
          )}
        </div>
        <div className="movers-col">
          <div className="movers-col-header losers">▼ Losers</div>
          {data.losers.length === 0 ? (
            <div className="movers-empty">No data available</div>
          ) : (
            data.losers.slice(0, 8).map(item => (
              <MoverRow key={item.symbol} item={item} type="loser" />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
