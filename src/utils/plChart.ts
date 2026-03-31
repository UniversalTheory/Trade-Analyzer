// P/L data generator for options strategy payoff diagrams

export interface PLPoint {
  price: number;
  pl: number;       // P/L at expiration
  plPct?: number;   // P/L as % of max risk
}

export interface PLChartData {
  points: PLPoint[];
  maxProfit: number;
  maxLoss: number;
  breakevens: number[];
  currentPrice?: number;
}

// Generic spread P/L generator
// All values in dollars. At expiration, option has only intrinsic value.
function callValue(price: number, strike: number): number {
  return Math.max(0, price - strike);
}

function putValue(price: number, strike: number): number {
  return Math.max(0, strike - price);
}

export type SpreadType =
  | 'bull-call'
  | 'bear-put'
  | 'bull-put'
  | 'bear-call'
  | 'iron-condor'
  | 'long-call'
  | 'long-put'
  | 'short-call'
  | 'short-put';

export interface SpreadParams {
  type: SpreadType;
  // For vertical spreads
  longStrike?: number;
  shortStrike?: number;
  premium?: number;   // Net debit (positive) or credit (negative) per share
  // For iron condors
  putLongStrike?: number;
  putShortStrike?: number;
  callLongStrike?: number;
  callShortStrike?: number;
  netCredit?: number;
  // For single options
  strike?: number;
  optionPremium?: number;
  quantity?: number; // Multiplier for contracts (default 1)
}

function generatePriceRange(center: number, widthFactor = 0.35, steps = 100): number[] {
  const low = center * (1 - widthFactor);
  const high = center * (1 + widthFactor);
  const step = (high - low) / steps;
  const prices: number[] = [];
  for (let p = low; p <= high; p += step) {
    prices.push(parseFloat(p.toFixed(2)));
  }
  return prices;
}

export function generatePLData(params: SpreadParams, currentPrice: number): PLChartData {
  const priceRange = generatePriceRange(currentPrice);
  const qty = params.quantity ?? 1;

  const plFn = buildPLFunction(params);
  const points: PLPoint[] = priceRange.map(price => ({
    price,
    pl: plFn(price) * qty * 100, // Per contract (100 shares)
  }));

  // Find max/min
  const plValues = points.map(p => p.pl);
  const maxProfit = Math.max(...plValues);
  const maxLoss = Math.min(...plValues);

  // Add pct of max risk
  const maxRisk = Math.abs(maxLoss);
  points.forEach(p => {
    p.plPct = maxRisk > 0 ? (p.pl / maxRisk) * 100 : 0;
  });

  // Find breakevens (sign changes)
  const breakevens: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (prev.pl * curr.pl < 0) {
      // Linear interpolation
      const be = prev.price + (0 - prev.pl) * (curr.price - prev.price) / (curr.pl - prev.pl);
      breakevens.push(parseFloat(be.toFixed(2)));
    }
  }

  return { points, maxProfit, maxLoss, breakevens, currentPrice };
}

function buildPLFunction(params: SpreadParams): (price: number) => number {
  switch (params.type) {
    case 'bull-call': {
      const { longStrike: l = 0, shortStrike: s = 0, premium = 0 } = params;
      return (p) => callValue(p, l) - callValue(p, s) - premium;
    }
    case 'bear-put': {
      const { longStrike: l = 0, shortStrike: s = 0, premium = 0 } = params;
      return (p) => putValue(p, l) - putValue(p, s) - premium;
    }
    case 'bull-put': {
      const { longStrike: l = 0, shortStrike: s = 0, premium = 0 } = params;
      // Credit spread: received premium (negative premium = credit received)
      const credit = -premium;
      return (p) => credit - (putValue(p, s) - putValue(p, l));
    }
    case 'bear-call': {
      const { longStrike: l = 0, shortStrike: s = 0, premium = 0 } = params;
      const credit = -premium;
      return (p) => credit - (callValue(p, s) - callValue(p, l));
    }
    case 'iron-condor': {
      const { putLongStrike = 0, putShortStrike = 0, callShortStrike = 0, callLongStrike = 0, netCredit = 0 } = params;
      return (p) =>
        netCredit
        - Math.max(0, putShortStrike - p - Math.max(0, putLongStrike - p))
        - Math.max(0, p - callShortStrike - Math.max(0, p - callLongStrike));
    }
    case 'long-call': {
      const { strike = 0, optionPremium = 0 } = params;
      return (p) => callValue(p, strike) - optionPremium;
    }
    case 'long-put': {
      const { strike = 0, optionPremium = 0 } = params;
      return (p) => putValue(p, strike) - optionPremium;
    }
    case 'short-call': {
      const { strike = 0, optionPremium = 0 } = params;
      return (p) => optionPremium - callValue(p, strike);
    }
    case 'short-put': {
      const { strike = 0, optionPremium = 0 } = params;
      return (p) => optionPremium - putValue(p, strike);
    }
    default:
      return () => 0;
  }
}
