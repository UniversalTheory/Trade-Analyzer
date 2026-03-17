import type { KellyInputs, KellyResult, KellyTier, VerdictType } from './types';

const fmt = (n: number) => n.toFixed(2);

function buildTier(fraction: number, account: number, cost: number, loss: number): KellyTier {
  const dollars = Math.max(0, fraction * account);
  const contracts = Math.max(0, Math.floor(dollars / cost));
  const risk = contracts * loss;
  const riskPct = (risk / account) * 100;
  return { fraction, dollars, contracts, risk, riskPct };
}

function buildInterpretation(
  _account: number,
  pop: number,
  ev: number,
  b: number,
  full: KellyTier,
  half: KellyTier,
  quarter: KellyTier,
): { verdict: VerdictType; verdictLabel: string; paragraphs: string[] } {
  const paragraphs: string[] = [];

  if (full.fraction <= 0) {
    paragraphs.push(
      `The Kelly fraction is ${fmt(full.fraction * 100)}%, indicating negative or zero edge. The mathematical formula recommends no position at this probability and payout ratio.`
    );
    paragraphs.push(
      `Review your probability of profit estimate. If POP is genuinely below ${fmt((1 / (1 + b)) * 100)}% for a ${fmt(b)}:1 payout, this trade does not have a positive expected value.`
    );
    return { verdict: 'stop', verdictLabel: 'Negative Edge — No Position', paragraphs };
  }

  paragraphs.push(
    `Full Kelly recommends allocating ${fmt(full.fraction * 100)}% of your account ($${fmt(full.dollars)}), yielding ${full.contracts} contract${full.contracts !== 1 ? 's' : ''}. Full Kelly maximizes long-run growth but implies severe drawdowns — rarely recommended in practice.`
  );

  const halfNote = half.riskPct <= 5
    ? `Half Kelly ($${fmt(half.dollars)}, ${half.contracts} contract${half.contracts !== 1 ? 's' : ''}) risks ${fmt(half.riskPct)}% of account — within the 5% guideline and recommended for most traders.`
    : `Half Kelly ($${fmt(half.dollars)}, ${half.contracts} contract${half.contracts !== 1 ? 's' : ''}) risks ${fmt(half.riskPct)}% of account, which exceeds the 5% guideline. Consider the Quarter Kelly sizing instead.`;
  paragraphs.push(halfNote);

  paragraphs.push(
    `Quarter Kelly ($${fmt(quarter.dollars)}, ${quarter.contracts} contract${quarter.contracts !== 1 ? 's' : ''}) risks ${fmt(quarter.riskPct)}% of account — the most conservative option, suitable for higher-uncertainty trades.`
  );

  paragraphs.push(
    `Kelly assumes your POP estimate of ${fmt(pop)}% is accurate. Overestimating edge leads to overbetting — when in doubt, use Quarter Kelly or reduce to 1–2 contracts until your edge is verified over a larger sample.`
  );

  let verdict: VerdictType;
  let verdictLabel: string;
  if (half.riskPct <= 5 && ev > 0) { verdict = 'go'; verdictLabel = 'Positive Edge — Size Appropriately'; }
  else if (ev > 0) { verdict = 'caution'; verdictLabel = 'Positive Edge — Reduce Size'; }
  else { verdict = 'caution'; verdictLabel = 'Marginal Edge — Small Position Only'; }

  return { verdict, verdictLabel, paragraphs };
}

export function calcKelly(inputs: KellyInputs): KellyResult | null {
  const { account, pop, profit, loss, cost } = inputs;
  if (!account || !pop || !profit || !loss || !cost) return null;

  const p = pop / 100;
  const q = 1 - p;
  const b = profit / loss;

  const kellyFull = (b * p - q) / b;
  const kellyHalf = kellyFull / 2;
  const kellyQuarter = kellyFull / 4;

  const full = buildTier(kellyFull, account, cost, loss);
  const half = buildTier(kellyHalf, account, cost, loss);
  const quarter = buildTier(kellyQuarter, account, cost, loss);

  const expectedValue = p * profit - q * loss;

  const { verdict, verdictLabel, paragraphs } = buildInterpretation(
    account, pop, expectedValue, b, full, half, quarter,
  );

  return { full, half, quarter, expectedValue, pop, account, b, verdict, verdictLabel, paragraphs };
}
