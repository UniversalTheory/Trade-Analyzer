// Lexicon-based sentiment fallback for news providers that don't return a sentiment
// score natively (Yahoo Finance, Finnhub general feed). Alpha Vantage already provides
// `overall_sentiment_score`, so its path stays untouched.
//
// Polarity is determined by net count of positive vs. negative finance terms found in
// the headline + summary. Threshold ±2 keeps single-word coincidences from flipping
// neutral stories.

const POSITIVE = [
  'beat', 'beats', 'surge', 'surges', 'rally', 'rallies', 'soar', 'soars', 'jump', 'jumps',
  'climb', 'climbs', 'gain', 'gains', 'rise', 'rises', 'rebound', 'rebounds',
  'upgrade', 'upgrades', 'outperform', 'outperforms', 'bullish', 'optimistic',
  'growth', 'growing', 'profit', 'profits', 'record', 'strong', 'stronger', 'robust',
  'boost', 'boosts', 'expand', 'expands', 'breakthrough', 'innovate', 'innovation',
  'positive', 'exceed', 'exceeds', 'tops', 'topped', 'momentum', 'win', 'wins',
  'launch', 'partnership', 'acquire', 'acquisition', 'dividend',
];

const NEGATIVE = [
  'miss', 'misses', 'plunge', 'plunges', 'plummet', 'plummets', 'tumble', 'tumbles',
  'fall', 'falls', 'slump', 'drop', 'drops', 'decline', 'declines', 'sink', 'sinks',
  'downgrade', 'downgrades', 'underperform', 'underperforms', 'bearish', 'pessimistic',
  'loss', 'losses', 'weak', 'weaker', 'disappoint', 'disappoints', 'disappointing',
  'cut', 'cuts', 'reduce', 'reduces', 'lawsuit', 'fine', 'probe', 'investigation',
  'layoff', 'layoffs', 'fire', 'fired', 'fraud', 'recall', 'warning', 'warns',
  'crash', 'crashes', 'fail', 'fails', 'failure', 'bankrupt', 'bankruptcy',
  'concern', 'concerns', 'risk', 'risks', 'slow', 'slowdown', 'recession',
];

const POSITIVE_SET = new Set(POSITIVE);
const NEGATIVE_SET = new Set(NEGATIVE);

export function scoreLexicon(text: string | undefined | null): 'positive' | 'negative' | 'neutral' {
  if (!text) return 'neutral';
  const tokens = text.toLowerCase().split(/[^a-z']+/);
  let net = 0;
  for (const t of tokens) {
    if (!t) continue;
    if (POSITIVE_SET.has(t)) net++;
    else if (NEGATIVE_SET.has(t)) net--;
  }
  if (net >= 2) return 'positive';
  if (net <= -2) return 'negative';
  return 'neutral';
}
