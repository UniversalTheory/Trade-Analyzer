import type { ExpectedMoveInputs, ExpectedMoveResult, VerdictType } from './types';

const fmt = (n: number) => n.toFixed(2);

function buildInterpretation(
  stock: number,
  iv: number,
  dte: number,
  em1sd: number,
  em2sd: number,
  emStraddle: number | null,
): { verdict: VerdictType; verdictLabel: string; paragraphs: string[] } {
  const paragraphs: string[] = [];

  let ivLevel: string;
  let ivClass: string;
  if (iv < 20) { ivLevel = 'low'; ivClass = 'green'; }
  else if (iv < 35) { ivLevel = 'moderate'; ivClass = 'blue'; }
  else if (iv < 50) { ivLevel = 'elevated'; ivClass = 'yellow'; }
  else { ivLevel = 'very high'; ivClass = 'red'; }

  paragraphs.push(
    `At ${fmt(iv)}% IV, implied volatility is [${ivClass}]${ivLevel}[/${ivClass}]. ` +
    (iv < 20
      ? 'Low IV environments favor buying options (long premium strategies like debit spreads or long straddles).'
      : iv < 35
      ? 'Moderate IV provides a balanced environment — either buying or selling premium can be appropriate depending on the setup.'
      : iv < 50
      ? 'Elevated IV favors selling premium (credit spreads, iron condors). Options are relatively expensive.'
      : 'Very high IV — option sellers are well-compensated but risk of sharp moves is significant. Size down accordingly.')
  );

  paragraphs.push(
    `Over ${dte} day${dte !== 1 ? 's' : ''}, the market implies a 1-standard-deviation move of ±$${fmt(em1sd)} (${fmt((em1sd / stock) * 100)}%). This means ~68% of outcomes are expected within $${fmt(stock - em1sd)}–$${fmt(stock + em1sd)}.`
  );

  paragraphs.push(
    `The 2-standard-deviation range of ±$${fmt(em2sd)} covers ~95% of expected outcomes ($${fmt(stock - em2sd)}–$${fmt(stock + em2sd)}). Moves beyond this are statistically rare but occur more frequently in equities than a normal distribution predicts.`
  );

  if (emStraddle !== null) {
    const diffPct = Math.abs((emStraddle / em1sd - 1) * 100);
    if (diffPct < 5) {
      paragraphs.push(
        `The straddle-based move of $${fmt(emStraddle)} closely aligns with the IV model (within ${fmt(diffPct)}%). Market pricing is consistent with the theoretical expected move.`
      );
    } else if (emStraddle > em1sd) {
      paragraphs.push(
        `The straddle implies a move of $${fmt(emStraddle)}, which is ${fmt(diffPct)}% larger than the IV model. The market may be pricing in an event-driven catalyst (earnings, FDA, etc.).`
      );
    } else {
      paragraphs.push(
        `The straddle implies a move of $${fmt(emStraddle)}, which is ${fmt(diffPct)}% smaller than the IV model suggests. The straddle appears relatively cheap compared to IV — potential long premium opportunity.`
      );
    }
  }

  paragraphs.push(
    `Use the expected move to set strike selection: for credit spreads, sell outside the 1SD range for high POP. For debit spreads targeting large moves, place strikes near the 1–2SD range for favorable risk/reward.`
  );

  return { verdict: 'info', verdictLabel: 'IV Analysis', paragraphs };
}

export function calcExpectedMove(inputs: ExpectedMoveInputs): ExpectedMoveResult | null {
  const { stock, iv, dte, straddle } = inputs;
  if (!stock || !iv || !dte) return null;

  const sigma = iv / 100;
  const t = dte / 365;
  const em1sd = stock * sigma * Math.sqrt(t);
  const em2sd = em1sd * 2;
  const emDaily = stock * sigma * Math.sqrt(1 / 365);
  const emStraddle = straddle ? straddle * 0.85 : null;

  const { verdict, verdictLabel, paragraphs } = buildInterpretation(
    stock, iv, dte, em1sd, em2sd, emStraddle,
  );

  return { em1sd, em2sd, emDaily, emStraddle, stock, iv, dte, verdict, verdictLabel, paragraphs };
}
