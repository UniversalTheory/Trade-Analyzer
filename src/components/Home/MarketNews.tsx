import type { NewsItem } from '../../api/types';

interface Props {
  news: NewsItem[];
  newsError?: boolean;
  compact?: boolean;  // condensed scrollable mode for use inside a panel card
}

const POSITIVE_KEYWORDS = [
  'surge', 'rally', 'beat', 'upgrade', 'rise', 'gain', 'jump', 'soar',
  'record', 'growth', 'strong', 'bullish', 'buy', 'outperform', 'profit',
  'boost', 'rebound', 'recover', 'higher', 'positive',
];

const NEGATIVE_KEYWORDS = [
  'crash', 'plunge', 'miss', 'downgrade', 'fall', 'drop', 'sink', 'tumble',
  'loss', 'weak', 'bearish', 'sell', 'underperform', 'warning', 'decline',
  'lower', 'negative', 'recession', 'fear', 'concern', 'risk',
];

function getSentiment(item: NewsItem): 'positive' | 'negative' | 'neutral' {
  if (item.sentiment) return item.sentiment;
  const text = (item.headline + ' ' + item.summary).toLowerCase();
  const pos = POSITIVE_KEYWORDS.filter(k => text.includes(k)).length;
  const neg = NEGATIVE_KEYWORDS.filter(k => text.includes(k)).length;
  if (pos > neg) return 'positive';
  if (neg > pos) return 'negative';
  return 'neutral';
}

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const SENTIMENT_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  positive: { color: 'var(--color-green)', bg: 'rgba(34,197,94,0.1)', label: '▲' },
  negative: { color: 'var(--color-red)',   bg: 'rgba(239,68,68,0.1)',  label: '▼' },
  neutral:  { color: 'var(--color-blue)',  bg: 'rgba(59,130,246,0.1)', label: '—' },
};

export default function MarketNews({ news, newsError, compact = false }: Props) {
  if (compact) {
    return (
      <div className="news-feed news-feed--compact">
        {newsError ? (
          <div className="news-empty">Unable to load news — will retry on next refresh</div>
        ) : news.length === 0 ? (
          <div className="news-empty">No news available</div>
        ) : (
          news.map(item => {
            const sentiment = getSentiment(item);
            const style = SENTIMENT_STYLES[sentiment];
            return (
              <a
                key={item.id}
                className="news-item news-item--compact"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span
                  className="news-sentiment-dot"
                  style={{ color: style.color, background: style.bg }}
                >
                  {style.label}
                </span>
                <div className="news-item-body">
                  <div className="news-headline">{item.headline}</div>
                  {item.summary && (
                    <div className="news-summary--compact">{item.summary}</div>
                  )}
                  <div className="news-meta">
                    <span className="news-source">{item.source}</span>
                    <span className="news-time">{timeAgo(item.datetime)}</span>
                  </div>
                </div>
              </a>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="news-panel">
      <div className="section-heading">Market News</div>
      <div className="news-feed">
        {news.length === 0 ? (
          <div className="news-empty">No news available</div>
        ) : (
          news.slice(0, 12).map(item => {
            const sentiment = getSentiment(item);
            const style = SENTIMENT_STYLES[sentiment];
            return (
              <a
                key={item.id}
                className="news-item"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="news-item-left">
                  <span
                    className="news-sentiment-dot"
                    style={{ color: style.color, background: style.bg }}
                  >
                    {style.label}
                  </span>
                </div>
                <div className="news-item-body">
                  <div className="news-headline">{item.headline}</div>
                  <div className="news-meta">
                    <span className="news-source">{item.source}</span>
                    <span className="news-time">{timeAgo(item.datetime)}</span>
                  </div>
                </div>
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
