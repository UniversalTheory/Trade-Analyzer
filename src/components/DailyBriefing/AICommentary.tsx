import { useEffect, useRef, useState } from 'react';
import { ai, market, ticker } from '../../api/client';
import type {
  QuoteData,
  SectorPerformance,
  MarketContext,
  NewsItem,
  EconomicEvent,
  EarningsData,
  ModelTier,
} from '../../api/types';
import { loadPortfolio } from '../../utils/portfolioStorage';
import { buildBriefingPrompt } from './buildBriefingPrompt';
import { fmtClockTime } from './timeHelpers';

interface Props {
  refreshKey: number;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; text: string; modelTier: ModelTier; modelId: string; costUsd: number; fromCache: boolean; at: Date }
  | { kind: 'not_configured' }
  | { kind: 'cap_reached' }
  | { kind: 'feature_disabled' }
  | { kind: 'error'; message: string };

const MAX_TOKENS = 700;
const DEFAULT_MODEL: ModelTier = 'sonnet';

export default function AICommentary({ refreshKey }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [bypassNonce, setBypassNonce] = useState(0);

  // Track latest request so out-of-order responses are dropped.
  const reqId = useRef(0);

  useEffect(() => {
    const my = ++reqId.current;
    let cancelled = false;
    setPhase({ kind: 'loading' });

    (async () => {
      try {
        const statusResp = await ai.getStatus().catch(() => ({ configured: false }));
        if (!statusResp.configured) {
          if (!cancelled && reqId.current === my) setPhase({ kind: 'not_configured' });
          return;
        }

        const positions = loadPortfolio().positions;

        // Parallel data fetches. Each path independently degrades to a safe default.
        const [
          indices,
          sectors,
          marketContext,
          calendarResp,
          marketNews,
          quoteResults,
          earningsResults,
        ] = await Promise.all([
          market.getIndices().catch((): QuoteData[] => []),
          market.getSectors().catch((): SectorPerformance[] => []),
          market.getContext().catch((): MarketContext | undefined => undefined),
          market.getCalendar().catch(() => ({ events: [] as EconomicEvent[] })),
          market.getNews().catch((): NewsItem[] => []),
          Promise.allSettled(positions.map(p => ticker.getQuote(p.symbol).then(q => ({ sym: p.symbol, q })))),
          Promise.allSettled(positions.map(p => ticker.getEarnings(p.symbol).then(e => ({ sym: p.symbol, e })))),
        ]);

        const quotes: Record<string, QuoteData> = {};
        for (const r of quoteResults) {
          if (r.status === 'fulfilled') quotes[r.value.sym] = r.value.q;
        }
        const earnings: Record<string, EarningsData> = {};
        for (const r of earningsResults) {
          if (r.status === 'fulfilled' && r.value.e) earnings[r.value.sym] = r.value.e;
        }

        // News only for the top 5 portfolio movers by USD impact (matches the YourPortfolioToday section).
        const movers = positions
          .map(p => {
            const q = quotes[p.symbol];
            if (!q || q.previousClose <= 0) return null;
            return { sym: p.symbol, contribution: p.shares * (q.price - q.previousClose) };
          })
          .filter((m): m is { sym: string; contribution: number } => !!m)
          .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
          .slice(0, 5);
        const newsResults = await Promise.allSettled(
          movers.map(m => ticker.getNews(m.sym).then(news => ({ sym: m.sym, news }))),
        );
        const moverNews: Record<string, NewsItem[]> = {};
        for (const r of newsResults) {
          if (r.status === 'fulfilled') moverNews[r.value.sym] = r.value.news ?? [];
        }

        const { system, userContent } = buildBriefingPrompt({
          asOfDate: new Date(),
          indices,
          sectors,
          marketContext,
          positions,
          quotes,
          earnings,
          moverNews,
          calendar: calendarResp.events ?? [],
          marketNews,
        });

        if (cancelled || reqId.current !== my) return;

        const resp = await ai.analyze({
          task: 'briefing',
          model: DEFAULT_MODEL,
          system,
          userContent,
          maxTokens: MAX_TOKENS,
          bypassCache: bypassNonce > 0,
        });

        if (cancelled || reqId.current !== my) return;
        setPhase({
          kind: 'ready',
          text: resp.text,
          modelTier: resp.modelTier,
          modelId: resp.modelId,
          costUsd: resp.costUsd,
          fromCache: resp.fromCache,
          at: new Date(),
        });
      } catch (err) {
        if (cancelled || reqId.current !== my) return;
        const message = (err as Error).message ?? 'unknown_error';
        if (message === 'cap_reached') setPhase({ kind: 'cap_reached' });
        else if (message === 'feature_disabled') setPhase({ kind: 'feature_disabled' });
        else setPhase({ kind: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, bypassNonce]);

  function handleRegenerate() {
    setBypassNonce(n => n + 1);
  }

  return (
    <section className="panel-card briefing-section briefing-section-ai">
      <div className="briefing-section-header">
        <h3 className="briefing-section-title">
          AI Commentary
          <span className="briefing-ai-badge">AI</span>
        </h3>
        <button
          className="briefing-ai-refresh"
          onClick={handleRegenerate}
          disabled={phase.kind === 'loading'}
          title="Generate a fresh narrative (bypasses cache)"
        >
          ⟳ Regenerate
        </button>
      </div>

      <AICommentaryBody phase={phase} />
    </section>
  );
}

function AICommentaryBody({ phase }: { phase: Phase }) {
  switch (phase.kind) {
    case 'idle':
    case 'loading':
      return <div className="briefing-ai-skeleton">Synthesizing today&rsquo;s briefing…</div>;

    case 'not_configured':
      return (
        <div className="briefing-empty-state">
          AI commentary is not configured. Add an <code>ANTHROPIC_API_KEY</code> to your
          {' '}<code>.env</code> file and restart the server to enable.
        </div>
      );

    case 'cap_reached':
      return (
        <div className="briefing-ai-blocked">
          Monthly AI spend cap reached. Raise the cap in settings to resume generation.
        </div>
      );

    case 'feature_disabled':
      return (
        <div className="briefing-ai-blocked">
          Briefing AI commentary is disabled. Re-enable in settings to resume generation.
        </div>
      );

    case 'error':
      return (
        <div className="briefing-ai-error">
          Couldn&rsquo;t generate commentary: {phase.message}
        </div>
      );

    case 'ready': {
      const paragraphs = phase.text.trim().split(/\n\s*\n/);
      return (
        <>
          <div className="briefing-ai-prose">
            {paragraphs.map((p, i) => (
              <p key={i}>{p.trim()}</p>
            ))}
          </div>
          <div className="briefing-ai-meta">
            <span>{phase.modelTier}</span>
            <span>·</span>
            <span>{phase.fromCache ? 'cached' : `$${phase.costUsd.toFixed(4)}`}</span>
            <span>·</span>
            <span>Generated {fmtClockTime(phase.at)}</span>
          </div>
        </>
      );
    }
  }
}
