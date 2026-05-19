import { useEffect, useMemo, useState } from 'react';
import { ticker, sector } from '../../api/client';
import type { PortfolioPosition } from '../../utils/portfolioStorage';
import type { NewsItem, AssetProfile } from '../../api/types';
import LoadingState from '../common/LoadingState';
import { uniqueSectorEtfs } from './sectorMap';

interface Props {
  positions: PortfolioPosition[];
  refreshKey: number;
  onShowInResearch?: (symbol: string) => void;
}

interface FeedItem {
  news: NewsItem;
  sourceSymbol: string;     // ticker or sector ETF the news came from
  sourceKind: 'ticker' | 'sector';
}

const MAX_FEED_ITEMS = 12;

function timeAgo(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function PortfolioNewsFeed({ positions, refreshKey, onShowInResearch }: Props) {
  const [tickerNews, setTickerNews] = useState<Record<string, NewsItem[]>>({});
  const [sectorNews, setSectorNews] = useState<Record<string, NewsItem[]>>({});
  const [profiles, setProfiles] = useState<Record<string, AssetProfile>>({});
  const [loading, setLoading] = useState<boolean>(positions.length > 0);

  const symbolsKey = positions.map(p => p.symbol).join(',');

  // Fetch news for every portfolio symbol.
  useEffect(() => {
    if (positions.length === 0) {
      setTickerNews({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.allSettled(
      positions.map(p =>
        ticker.getNews(p.symbol)
          .then(news => ({ sym: p.symbol, news }))
          .catch(() => ({ sym: p.symbol, news: [] as NewsItem[] })),
      ),
    ).then(results => {
      if (cancelled) return;
      const next: Record<string, NewsItem[]> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') next[r.value.sym] = r.value.news ?? [];
      }
      setTickerNews(next);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [symbolsKey, refreshKey]);

  // Fetch profiles to identify each symbol's sector (cached for session — only fetch missing).
  useEffect(() => {
    if (positions.length === 0) {
      setProfiles({});
      return;
    }
    const missing = positions.map(p => p.symbol).filter(s => !(s in profiles));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.allSettled(
      missing.map(s =>
        ticker.getProfile(s)
          .then(prof => ({ sym: s, prof }))
          .catch(() => ({ sym: s, prof: null as AssetProfile | null })),
      ),
    ).then(results => {
      if (cancelled) return;
      setProfiles(prev => {
        const next = { ...prev };
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.prof) {
            next[r.value.sym] = r.value.prof;
          }
        }
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  // Fetch news for each unique sector represented in the portfolio.
  const sectorEtfsKey = useMemo(() => {
    return uniqueSectorEtfs(positions.map(p => profiles[p.symbol]?.sector)).join(',');
  }, [positions, profiles]);

  useEffect(() => {
    const etfs = sectorEtfsKey ? sectorEtfsKey.split(',') : [];
    if (etfs.length === 0) {
      setSectorNews({});
      return;
    }
    let cancelled = false;
    Promise.allSettled(
      etfs.map(etf =>
        sector.getNews(etf)
          .then(news => ({ etf, news }))
          .catch(() => ({ etf, news: [] as NewsItem[] })),
      ),
    ).then(results => {
      if (cancelled) return;
      const next: Record<string, NewsItem[]> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') next[r.value.etf] = r.value.news ?? [];
      }
      setSectorNews(next);
    });
    return () => { cancelled = true; };
  }, [sectorEtfsKey, refreshKey]);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    const seenUrls = new Set<string>();

    for (const sym of Object.keys(tickerNews)) {
      for (const n of tickerNews[sym]) {
        if (n.url && seenUrls.has(n.url)) continue;
        if (n.url) seenUrls.add(n.url);
        items.push({ news: n, sourceSymbol: sym, sourceKind: 'ticker' });
      }
    }
    for (const etf of Object.keys(sectorNews)) {
      for (const n of sectorNews[etf]) {
        if (n.url && seenUrls.has(n.url)) continue;
        if (n.url) seenUrls.add(n.url);
        items.push({ news: n, sourceSymbol: etf, sourceKind: 'sector' });
      }
    }
    items.sort((a, b) => b.news.datetime - a.news.datetime);
    return items.slice(0, MAX_FEED_ITEMS);
  }, [tickerNews, sectorNews]);

  if (positions.length === 0) return null;

  return (
    <div className="briefing-portfolio-news">
      <div className="briefing-mini-heading">
        Portfolio &amp; Sector News
        <span className="briefing-mini-meta"> · top {MAX_FEED_ITEMS}</span>
      </div>
      {loading && feed.length === 0 ? (
        <LoadingState rows={3} height={20} />
      ) : feed.length === 0 ? (
        <div className="briefing-empty-line">No recent news for your portfolio.</div>
      ) : (
        <ul className="briefing-news-list">
          {feed.map(item => (
            <FeedRow key={item.news.id} item={item} onShowInResearch={onShowInResearch} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FeedRow({
  item,
  onShowInResearch,
}: {
  item: FeedItem;
  onShowInResearch?: (symbol: string) => void;
}) {
  const clickable = !!onShowInResearch;
  return (
    <li className="briefing-news-row">
      <button
        className={`briefing-news-tag briefing-news-tag-${item.sourceKind}${clickable ? ' clickable' : ''}`}
        onClick={clickable ? (e) => { e.stopPropagation(); onShowInResearch!(item.sourceSymbol); } : undefined}
        type="button"
        title={`Open ${item.sourceSymbol} in Research`}
        disabled={!clickable}
      >
        {item.sourceSymbol}
      </button>
      <div className="briefing-news-body">
        <a
          href={item.news.url}
          target="_blank"
          rel="noopener noreferrer"
          className="briefing-news-headline"
        >
          {item.news.headline}
        </a>
        <span className="briefing-news-meta">
          {item.news.source} · {timeAgo(item.news.datetime)}
        </span>
      </div>
    </li>
  );
}
