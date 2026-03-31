export type SpreadType = 'bull-call' | 'bear-put' | 'bull-put' | 'bear-call' | 'iron-condor';
export type VerdictType = 'go' | 'caution' | 'stop' | 'info';

export interface SpreadInputs {
  type: SpreadType;
  stock: number;
  strikeA: number;
  strikeB: number;
  premA: number;
  premB: number;
  // Iron condor fields
  icLongPut: number;
  icShortPut: number;
  icShortCall: number;
  icLongCall: number;
  icCredit: number;
  contracts: number;
  account: number;
}

export interface SpreadResult {
  name: string;
  isCredit: boolean;
  maxProfit: number;
  maxLoss: number;
  rewardRisk: number;
  pop: number;
  breakevens: number[];
  accountRisk: number | null;
  expectedValue: number;
  contracts: number;
  stock: number;
  verdict: VerdictType;
  verdictLabel: string;
  score: number;
  paragraphs: string[];
}

export interface ExpectedMoveInputs {
  stock: number;
  iv: number;
  dte: number;
  straddle: number | null;
}

export interface ExpectedMoveResult {
  em1sd: number;
  em2sd: number;
  emDaily: number;
  emStraddle: number | null;
  stock: number;
  iv: number;
  dte: number;
  verdict: VerdictType;
  verdictLabel: string;
  paragraphs: string[];
}

export interface KellyInputs {
  account: number;
  pop: number;
  profit: number;
  loss: number;
  cost: number;
}

export interface KellyTier {
  fraction: number;
  dollars: number;
  contracts: number;
  risk: number;
  riskPct: number;
}

export interface KellyResult {
  full: KellyTier;
  half: KellyTier;
  quarter: KellyTier;
  expectedValue: number;
  pop: number;
  account: number;
  b: number;
  verdict: VerdictType;
  verdictLabel: string;
  paragraphs: string[];
}

// Black-Scholes types
export interface BlackScholesInputs {
  stockPrice: string;
  strikePrice: string;
  daysToExpiry: string;
  riskFreeRate: string;
  volatility: string;
  optionType: 'call' | 'put';
}

export interface GreeksResult {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface BlackScholesResult {
  price: number;
  intrinsicValue: number;
  timeValue: number;
  d1: number;
  d2: number;
  greeks: GreeksResult;
  verdict: VerdictType;
  verdictLabel: string;
  paragraphs: string[];
}
