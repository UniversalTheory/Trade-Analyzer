// Black-Scholes option pricing model and Greeks

// Cumulative standard normal distribution (Hart approximation)
function cdf(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const y = 1.0 - poly * Math.exp(-absX * absX / 2) / Math.sqrt(2 * Math.PI);
  return 0.5 * (1.0 + sign * y);
}

// Standard normal probability density function
function pdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BlackScholesInputs {
  stockPrice: number;      // S — current stock price
  strikePrice: number;     // K — option strike price
  timeToExpiry: number;    // T — time to expiration in years
  riskFreeRate: number;    // r — risk-free interest rate (decimal, e.g. 0.045)
  volatility: number;      // σ — implied volatility (decimal, e.g. 0.25)
  optionType: 'call' | 'put';
}

export interface BlackScholesResult {
  price: number;
  intrinsicValue: number;
  timeValue: number;
  d1: number;
  d2: number;
  greeks: GreeksResult;
}

export interface GreeksResult {
  delta: number;   // Rate of change of option price w.r.t. stock price
  gamma: number;   // Rate of change of delta w.r.t. stock price
  theta: number;   // Daily time decay (per calendar day)
  vega: number;    // Price sensitivity to 1% change in IV
  rho: number;     // Price sensitivity to 1% change in risk-free rate
}

export function calcBlackScholes(inputs: BlackScholesInputs): BlackScholesResult | null {
  const { stockPrice: S, strikePrice: K, timeToExpiry: T, riskFreeRate: r, volatility: sigma, optionType } = inputs;

  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return null;

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  let price: number;
  let delta: number;
  let rho: number;

  if (optionType === 'call') {
    price = S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
    delta = cdf(d1);
    rho = K * T * Math.exp(-r * T) * cdf(d2) / 100;
  } else {
    price = K * Math.exp(-r * T) * cdf(-d2) - S * cdf(-d1);
    delta = cdf(d1) - 1;
    rho = -K * T * Math.exp(-r * T) * cdf(-d2) / 100;
  }

  // Shared Greeks
  const gamma = pdf(d1) / (S * sigma * sqrtT);
  const vegaRaw = S * pdf(d1) * sqrtT;
  const vega = vegaRaw / 100; // Per 1% change in IV
  // Theta: annualized — divide by 365 for per-calendar-day
  const thetaRaw = optionType === 'call'
    ? (-S * pdf(d1) * sigma / (2 * sqrtT) - r * K * Math.exp(-r * T) * cdf(d2))
    : (-S * pdf(d1) * sigma / (2 * sqrtT) + r * K * Math.exp(-r * T) * cdf(-d2));
  const theta = thetaRaw / 365;

  const intrinsicValue = optionType === 'call'
    ? Math.max(0, S - K)
    : Math.max(0, K - S);
  const timeValue = Math.max(0, price - intrinsicValue);

  return {
    price: Math.max(0, price),
    intrinsicValue,
    timeValue,
    d1,
    d2,
    greeks: { delta, gamma, theta, vega, rho },
  };
}

// Calculate IV from a known market price using Newton-Raphson iteration
export function calcImpliedVolatility(
  marketPrice: number,
  inputs: Omit<BlackScholesInputs, 'volatility'>,
  tolerance = 0.0001,
  maxIterations = 100,
): number | null {
  let sigma = 0.25; // Initial guess

  for (let i = 0; i < maxIterations; i++) {
    const result = calcBlackScholes({ ...inputs, volatility: sigma });
    if (!result) return null;

    const diff = result.price - marketPrice;
    if (Math.abs(diff) < tolerance) return sigma;

    const vegaVal = result.greeks.vega * 100; // Back to raw vega
    if (Math.abs(vegaVal) < 1e-10) return null;

    sigma = sigma - diff / vegaVal;
    if (sigma <= 0) sigma = 0.001;
  }

  return sigma;
}
