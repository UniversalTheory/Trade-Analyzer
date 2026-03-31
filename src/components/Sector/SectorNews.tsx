import type { NewsItem } from '../../api/types';
import MarketNews from '../Home/MarketNews';

interface Props {
  news: NewsItem[];
  sectorName: string;
}

export default function SectorNews({ news, sectorName }: Props) {
  return (
    <div className="sector-news-panel">
      <div className="section-heading">{sectorName} News</div>
      {news.length === 0 ? (
        <div className="news-empty">No recent news found for this sector.</div>
      ) : (
        <MarketNews news={news} />
      )}
    </div>
  );
}
