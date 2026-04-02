import type { FundamentalsData } from '../../api/types';

interface Props {
  data: FundamentalsData;
}

// ── Formatters ────────────────────────────────────────────────
function fmtNum(v: number | undefined, decimals = 2): string {
  if (v === undefined || v === null) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtLarge(v: number | undefined): string {
  if (v === undefined || v === null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9)  return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6)  return `$${(v / 1e6).toFixed(2)}M`;
  return `$${v.toLocaleString()}`;
}

function fmtPct(v: number | undefined, decimals = 1): string {
  if (v === undefined || v === null) return '—';
  return `${(v * 100).toFixed(decimals)}%`;
}

function fmtX(v: number | undefined, decimals = 2): string {
  if (v === undefined || v === null) return '—';
  return `${v.toFixed(decimals)}x`;
}

function fmtRec(v: string | undefined): string {
  if (!v) return '—';
  const map: Record<string, string> = {
    strongBuy: 'Strong Buy', buy: 'Buy', hold: 'Hold',
    underperform: 'Underperform', sell: 'Sell',
  };
  return map[v] ?? v.replace(/([A-Z])/g, ' $1').trim();
}

function recColor(v: string | undefined): string {
  if (!v) return 'var(--text-muted)';
  if (v === 'strongBuy' || v === 'buy') return 'var(--color-green)';
  if (v === 'hold') return 'var(--color-blue)';
  return 'var(--color-red)';
}

// ── Row component ─────────────────────────────────────────────
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="fund-row">
      <span className="fund-row-label">{label}</span>
      <span className="fund-row-value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fund-section">
      <div className="fund-section-title">{title}</div>
      <div className="fund-section-rows">{children}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function FundamentalsCard({ data: d }: Props) {
  return (
    <div className="fundamentals-card">
      <div className="fundamentals-heading">Fundamentals</div>

      <div className="fund-grid">

        <Section title="Valuation">
          <Row label="Market Cap"      value={fmtLarge(d.marketCap)} />
          <Row label="Enterprise Value" value={fmtLarge(d.enterpriseValue)} />
          <Row label="P/E (TTM)"       value={fmtNum(d.trailingPE, 1)} />
          <Row label="Forward P/E"     value={fmtNum(d.forwardPE, 1)} />
          <Row label="P/S Ratio"       value={fmtNum(d.priceToSales, 2)} />
          <Row label="P/B Ratio"       value={fmtNum(d.priceToBook, 2)} />
          <Row label="EV / EBITDA"     value={fmtNum(d.evToEbitda, 1)} />
        </Section>

        <Section title="Profitability">
          <Row label="Revenue (TTM)"   value={fmtLarge(d.revenue)} />
          <Row label="Gross Margin"    value={fmtPct(d.grossMargin)} />
          <Row label="EBITDA Margin"   value={fmtPct(d.ebitdaMargin)} />
          <Row label="Oper. Margin"    value={fmtPct(d.operatingMargin)} />
          <Row label="Net Margin"      value={fmtPct(d.netMargin)} />
          <Row label="Return on Equity" value={fmtPct(d.roe)} />
          <Row label="Return on Assets" value={fmtPct(d.roa)} />
        </Section>

        <Section title="Financial Health">
          <Row label="Cash &amp; Equiv."   value={fmtLarge(d.cash)} />
          <Row label="Total Debt"       value={fmtLarge(d.totalDebt)} />
          <Row label="Free Cash Flow"   value={fmtLarge(d.freeCashFlow)} />
          <Row label="Oper. Cash Flow"  value={fmtLarge(d.operatingCashFlow)} />
          <Row label="Current Ratio"    value={fmtX(d.currentRatio)} />
          <Row label="Debt / Equity"    value={fmtNum(d.debtToEquity, 2)} />
        </Section>

        <Section title="Growth (YoY)">
          <Row
            label="Revenue Growth"
            value={fmtPct(d.revenueGrowth)}
            color={d.revenueGrowth !== undefined ? (d.revenueGrowth >= 0 ? 'var(--color-green)' : 'var(--color-red)') : undefined}
          />
          <Row
            label="Earnings Growth"
            value={fmtPct(d.earningsGrowth)}
            color={d.earningsGrowth !== undefined ? (d.earningsGrowth >= 0 ? 'var(--color-green)' : 'var(--color-red)') : undefined}
          />
        </Section>

        <Section title="Share Data">
          <Row label="Beta"              value={fmtNum(d.beta, 3)} />
          <Row label="Shares Out."       value={d.sharesOutstanding ? fmtLarge(d.sharesOutstanding) : '—'} />
          <Row label="Short % Float"     value={fmtPct(d.shortPercentFloat)} />
          <Row label="Insider Held"      value={fmtPct(d.insiderHeld)} />
          <Row label="Institution Held"  value={fmtPct(d.institutionHeld)} />
          <Row label="Dividend Yield"    value={fmtPct(d.dividendYield)} />
          <Row label="Payout Ratio"      value={fmtPct(d.payoutRatio)} />
        </Section>

        <Section title="Analyst Consensus">
          <Row
            label="Rating"
            value={fmtRec(d.recommendation)}
            color={recColor(d.recommendation)}
          />
          <Row label="# Analysts"    value={d.analystCount !== undefined ? String(d.analystCount) : '—'} />
          <Row label="Price Target"  value={fmtNum(d.targetMean) !== '—' ? `$${fmtNum(d.targetMean)}` : '—'} />
          <Row label="Target High"   value={fmtNum(d.targetHigh) !== '—' ? `$${fmtNum(d.targetHigh)}` : '—'} />
          <Row label="Target Low"    value={fmtNum(d.targetLow) !== '—' ? `$${fmtNum(d.targetLow)}` : '—'} />
        </Section>

      </div>
    </div>
  );
}
