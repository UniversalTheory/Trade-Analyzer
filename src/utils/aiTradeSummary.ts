import { useEffect, useRef, useState } from 'react';
import { ai } from '../api/client';
import { setSnapshot as setUsageSnapshot } from './aiUsageStore';
import type { ModelTier } from '../api/types';
import type { Recommendation, ScoringResult } from './recommendationEngine';
import type { FundamentalsData } from '../api/types';

// Hook that asynchronously upgrades the deterministic trade-rec summary into
// AI-generated prose. Falls back silently to the rule-based summary if AI is
// off, blocked, or errors — callers always have a working summary to display.

const MAX_TOKENS = 220;

export type AiTradeSummaryState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; text: string; modelTier: ModelTier; costUsd: number; fromCache: boolean }
  | { kind: 'skipped' };

const SYSTEM = [
  'You are a concise options-trading analyst.',
  'Given a structured snapshot of a ticker\'s signal analysis and strategy recommendations, write a 2-3 sentence summary.',
  'Cover: overall sentiment + signal picture, the key driver(s) behind it, and what the recommended strategies tilt toward.',
  'No preamble, no bullet lists, no headings. Begin directly with the analysis.',
  'Be direct and specific. Reference the ticker by symbol. Avoid hedge phrases unless data warrants.',
].join(' ');

interface Args {
  symbol: string;
  result: ScoringResult;
  recs: Recommendation[];
  fundamentals?: FundamentalsData;
}

function describeIv(result: ScoringResult & { ivAnalysis?: { ivPercentileEstimate: number; ivRank: string; atmIV: number; hv30: number } | null }): string | null {
  const iv = result.ivAnalysis;
  if (!iv) return null;
  return `IV: ~${iv.ivPercentileEstimate}th pct (${iv.ivRank}), ATM IV ${(iv.atmIV * 100).toFixed(0)}%, HV30 ${(iv.hv30 * 100).toFixed(0)}%`;
}

function buildPrompt(a: Args): string {
  const lines: string[] = [];
  lines.push(`Symbol: ${a.symbol}`);
  const score = a.result.compositeScore;
  const tone =
    score >= 0.35 ? 'strongly bullish'
    : score >= 0.15 ? 'moderately bullish'
    : score <= -0.35 ? 'strongly bearish'
    : score <= -0.15 ? 'moderately bearish'
    : 'mixed / neutral';
  lines.push(`Composite score: ${score >= 0 ? '+' : ''}${score.toFixed(2)} (${tone})`);
  lines.push(`Confidence: ${(a.result.confidence * 100).toFixed(0)}%, agreement: ${(a.result.signalAgreement * 100).toFixed(0)}%`);
  lines.push(`Counts: ${a.result.bullishCount} bullish, ${a.result.bearishCount} bearish, ${a.result.neutralCount} neutral`);

  const ivLine = describeIv(a.result as ScoringResult & { ivAnalysis?: { ivPercentileEstimate: number; ivRank: string; atmIV: number; hv30: number } | null });
  if (ivLine) lines.push(ivLine);

  // Top signals per category — only the most-weighted, to keep tokens tight.
  const byCat: Record<string, typeof a.result.signals> = { technical: [], fundamental: [], volatility: [] };
  for (const s of a.result.signals) {
    byCat[s.category]?.push(s);
  }
  lines.push('');
  lines.push('Top signals:');
  for (const cat of ['technical', 'fundamental', 'volatility'] as const) {
    const sorted = byCat[cat].slice().sort((x, y) => Math.abs(y.score) - Math.abs(x.score)).slice(0, 3);
    if (sorted.length === 0) continue;
    for (const s of sorted) {
      lines.push(`  ${cat} · ${s.label} ${s.direction}: ${s.reason}`);
    }
  }

  if (a.recs.length > 0) {
    lines.push('');
    lines.push('Top recommended strategies:');
    for (const r of a.recs.slice(0, 3)) {
      lines.push(`  ${r.strategy} (${r.type}, ${(r.confidence * 100).toFixed(0)}% conf) — ${r.reasoning.primary}`);
    }
  } else {
    lines.push('');
    lines.push('No recommendations met the quality threshold this run.');
  }

  return lines.join('\n');
}

export function useAiTradeSummary(args: Args): AiTradeSummaryState {
  const [state, setState] = useState<AiTradeSummaryState>({ kind: 'idle' });
  const reqId = useRef(0);

  // Key the effect on a content fingerprint so identical re-renders don't refire.
  const fingerprint = `${args.symbol}|${args.result.compositeScore.toFixed(3)}|${args.result.signals.length}|${args.recs.length}`;

  useEffect(() => {
    const my = ++reqId.current;
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        // Quick status check — if AI not configured, skip silently so the
        // rule-based summary stays visible.
        const status = await ai.getStatus().catch(() => ({ configured: false }));
        if (!status.configured) {
          if (!cancelled && reqId.current === my) setState({ kind: 'skipped' });
          return;
        }

        const resp = await ai.analyze({
          task: 'recSummary',
          system: SYSTEM,
          userContent: buildPrompt(args),
          maxTokens: MAX_TOKENS,
          cacheKey: `recSummary:${args.symbol}:${fingerprint}`,
        });

        if (cancelled || reqId.current !== my) return;
        setUsageSnapshot(resp.usage);
        setState({
          kind: 'ready',
          text: resp.text.trim(),
          modelTier: resp.modelTier,
          costUsd: resp.costUsd,
          fromCache: resp.fromCache,
        });
      } catch {
        // Any error (cap reached, feature disabled, network) → fall back quietly.
        if (cancelled || reqId.current !== my) return;
        setState({ kind: 'skipped' });
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  return state;
}
