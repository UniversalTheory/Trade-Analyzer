import type { SpreadInputs, SpreadResult, VerdictType } from './types';

const fmt = (n: number) => n.toFixed(2);

function buildInterpretation(
  name: string,
  isCredit: boolean,
  maxProfit: number,
  maxLoss: number,
  rr: number,
  pop: number,
  breakevens: number[],
  stock: number,
  accountRisk: number | null,
  ev: number,
  contracts: number,
): { verdict: VerdictType; verdictLabel: string; score: number; paragraphs: string[] } {
  let score = 0;
  if (ev > 0) score += 2;
  if (pop >= 55) score += 1;
  if (pop >= 70) score += 1;
  if (rr >= 0.5) score += 1;
  if (rr >= 1.0) score += 1;
  if (accountRisk !== null && accountRisk <= 5) score += 1;
  if (accountRisk !== null && accountRisk <= 2) score += 1;

  let verdict: VerdictType;
  let verdictLabel: string;
  if (score >= 6) { verdict = 'go'; verdictLabel = 'Favorable Setup'; }
  else if (score >= 4) { verdict = 'caution'; verdictLabel = 'Proceed with Caution'; }
  else { verdict = 'stop'; verdictLabel = 'Unfavorable — Reconsider'; }

  const paragraphs: string[] = [];

  const totalProfit = maxProfit;
  const totalLoss = maxLoss;
  const netPerContract = isCredit
    ? (maxProfit / contracts / 100).toFixed(2)
    : (maxLoss / contracts / 100).toFixed(2);

  paragraphs.push(
    isCredit
      ? `This ${name} is a credit spread collecting $${netPerContract}/contract. Your maximum profit of $${fmt(totalProfit)} is capped and realized if the position expires worthless. Maximum loss of $${fmt(totalLoss)} occurs at full adverse movement.`
      : `This ${name} is a debit spread costing $${netPerContract}/contract. Your maximum profit of $${fmt(totalProfit)} is realized at expiration if the spread expires in full. Maximum loss of $${fmt(totalLoss)} is limited to the debit paid.`
  );

  if (breakevens.length === 1) {
    const dist = Math.abs(breakevens[0] - stock);
    const distPct = ((dist / stock) * 100).toFixed(1);
    paragraphs.push(
      `Breakeven is $${fmt(breakevens[0])}, requiring the stock to move ${distPct}% ${breakevens[0] > stock ? 'up' : 'down'} from the current price of $${fmt(stock)}.`
    );
  } else {
    paragraphs.push(
      `Breakevens are $${fmt(breakevens[0])} and $${fmt(breakevens[1])}. The stock must stay between these levels for full profit, giving a ${fmt(breakevens[1] - breakevens[0])}-point profit zone.`
    );
  }

  paragraphs.push(
    ev > 0
      ? `Expected value is $${fmt(ev)}, indicating a positive edge over many repetitions at the estimated probability of profit.`
      : `Expected value is $${fmt(ev)}, which is negative. This trade has a mathematical disadvantage at the estimated POP — consider whether your POP estimate is accurate.`
  );

  if (rr < 0.33) {
    paragraphs.push(
      `Reward-to-risk of ${fmt(rr)}:1 is low. You need a high win rate (>75%) to be profitable long-term. Ensure POP justifies this unfavorable ratio.`
    );
  } else if (rr > 2) {
    paragraphs.push(
      `Reward-to-risk of ${fmt(rr)}:1 is excellent. Even a modest win rate produces long-term profitability.`
    );
  }

  if (accountRisk !== null) {
    if (accountRisk <= 2) {
      paragraphs.push(`Account risk of ${fmt(accountRisk)}% is conservative and well within the 2% guideline. Position size is appropriate.`);
    } else if (accountRisk <= 5) {
      paragraphs.push(`Account risk of ${fmt(accountRisk)}% is within the 5% threshold but above the ideal 2% guideline. Consider reducing contracts for tighter risk management.`);
    } else {
      paragraphs.push(`Account risk of ${fmt(accountRisk)}% exceeds the 5% guideline. This is an oversized position — reduce contracts to limit downside exposure.`);
    }
  }

  paragraphs.push(
    `Management rules: consider closing for a 50% profit target. For credit spreads, defend at 2× the credit received. For debit spreads, cut losses at 50% of debit paid.`
  );

  return { verdict, verdictLabel, score, paragraphs };
}

export function calcSpread(inputs: SpreadInputs): SpreadResult | null {
  const { type, stock, contracts, account } = inputs;

  let maxProfit: number;
  let maxLoss: number;
  let breakevens: number[];
  let isCredit: boolean;
  let name: string;
  let netDebitCredit: number;
  let width: number;

  if (type === 'iron-condor') {
    const { icLongPut, icShortPut, icShortCall, icLongCall, icCredit } = inputs;
    if (!stock || !icLongPut || !icShortPut || !icShortCall || !icLongCall || !icCredit) return null;
    const putWidth = icShortPut - icLongPut;
    const callWidth = icLongCall - icShortCall;
    width = Math.max(putWidth, callWidth);
    const credit = icCredit;
    maxProfit = credit * 100 * contracts;
    maxLoss = (width - credit) * 100 * contracts;
    breakevens = [icShortPut - credit, icShortCall + credit];
    isCredit = true;
    name = 'Iron Condor';
    netDebitCredit = credit;
  } else {
    const { strikeA, strikeB, premA, premB } = inputs;
    if (!stock || !strikeA || !strikeB || !premA || !premB) return null;

    if (type === 'bull-call') {
      width = strikeB - strikeA;
      const debit = premA - premB;
      maxProfit = (width - debit) * 100 * contracts;
      maxLoss = debit * 100 * contracts;
      breakevens = [strikeA + debit];
      isCredit = false;
      name = 'Bull Call Spread';
      netDebitCredit = debit;
    } else if (type === 'bear-put') {
      width = strikeA - strikeB;
      const debit = premA - premB;
      maxProfit = (width - debit) * 100 * contracts;
      maxLoss = debit * 100 * contracts;
      breakevens = [strikeA - debit];
      isCredit = false;
      name = 'Bear Put Spread';
      netDebitCredit = debit;
    } else if (type === 'bull-put') {
      width = strikeA - strikeB;
      const credit = premA - premB;
      maxProfit = credit * 100 * contracts;
      maxLoss = (width - credit) * 100 * contracts;
      breakevens = [strikeA - credit];
      isCredit = true;
      name = 'Bull Put Spread';
      netDebitCredit = credit;
    } else {
      // bear-call
      width = strikeB - strikeA;
      const credit = premA - premB;
      maxProfit = credit * 100 * contracts;
      maxLoss = (width - credit) * 100 * contracts;
      breakevens = [strikeA + credit];
      isCredit = true;
      name = 'Bear Call Spread';
      netDebitCredit = credit;
    }
  }

  const rewardRisk = maxProfit / maxLoss;
  const popApprox = (netDebitCredit / width) * 100;
  const pop = isCredit ? popApprox : 100 - popApprox;
  const accountRisk = account ? (maxLoss / account) * 100 : null;
  const expectedValue = (pop / 100) * maxProfit - ((100 - pop) / 100) * maxLoss;

  const { verdict, verdictLabel, score, paragraphs } = buildInterpretation(
    name, isCredit, maxProfit, maxLoss, rewardRisk, pop, breakevens,
    stock, accountRisk, expectedValue, contracts,
  );

  return {
    name,
    isCredit,
    maxProfit,
    maxLoss,
    rewardRisk,
    pop,
    breakevens,
    accountRisk,
    expectedValue,
    contracts,
    stock,
    verdict,
    verdictLabel,
    score,
    paragraphs,
  };
}
