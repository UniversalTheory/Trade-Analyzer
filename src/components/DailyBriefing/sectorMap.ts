// Maps Yahoo Finance sector strings to SPDR sector ETF tickers.
// Used by the Daily Briefing to surface sector news for portfolio holdings.

const YAHOO_SECTOR_TO_ETF: Record<string, string> = {
  'Technology':             'XLK',
  'Healthcare':             'XLV',
  'Financial Services':     'XLF',
  'Consumer Cyclical':      'XLY',
  'Consumer Defensive':     'XLP',
  'Energy':                 'XLE',
  'Utilities':              'XLU',
  'Industrials':            'XLI',
  'Basic Materials':        'XLB',
  'Real Estate':            'XLRE',
  'Communication Services': 'XLC',
};

export function sectorEtfFor(yahooSector: string | undefined | null): string | null {
  if (!yahooSector) return null;
  return YAHOO_SECTOR_TO_ETF[yahooSector] ?? null;
}

export function uniqueSectorEtfs(sectors: (string | undefined | null)[]): string[] {
  const out = new Set<string>();
  for (const s of sectors) {
    const etf = sectorEtfFor(s);
    if (etf) out.add(etf);
  }
  return Array.from(out);
}
