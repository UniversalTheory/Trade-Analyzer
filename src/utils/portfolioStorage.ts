// Portfolio persistence layer. Single-portfolio v1 stored in localStorage.
// `type` discriminator on positions leaves room for options positions later.

export interface StockPosition {
  id: string;
  type: 'stock';
  symbol: string;
  shares: number;
  avgPrice: number;
  addedAt: string; // ISO date
}

// Union so future option positions can be added without breaking existing code.
export type PortfolioPosition = StockPosition;

export interface PortfolioState {
  version: 1;
  positions: PortfolioPosition[];
  cash: number;
  selectedDate: string | null; // ISO 'YYYY-MM-DD' — null = no period P/L
}

const STORAGE_KEY = 'portfolio_v1';

const EMPTY: PortfolioState = {
  version: 1,
  positions: [],
  cash: 0,
  selectedDate: null,
};

export function loadPortfolio(): PortfolioState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as PortfolioState;
    if (parsed.version !== 1 || !Array.isArray(parsed.positions)) return EMPTY;
    return parsed;
  } catch {
    return EMPTY;
  }
}

export function savePortfolio(state: PortfolioState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function newStockPosition(symbol: string, shares: number, avgPrice: number): StockPosition {
  return {
    id: crypto.randomUUID(),
    type: 'stock',
    symbol: symbol.toUpperCase(),
    shares,
    avgPrice,
    addedAt: new Date().toISOString().slice(0, 10),
  };
}
