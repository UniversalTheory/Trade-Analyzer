import type { GreeksResult } from '../../utils/types';

interface Props {
  greeks: GreeksResult;
  optionType: 'call' | 'put';
}

interface GreekMeta {
  key: keyof GreeksResult;
  label: string;
  symbol: string;
  description: string;
  format: (v: number) => string;
  colorFn: (v: number, type: 'call' | 'put') => string;
}

const GREEKS_META: GreekMeta[] = [
  {
    key: 'delta',
    label: 'Delta',
    symbol: 'Δ',
    description: 'Change in option price per $1 move in stock',
    format: (v) => v.toFixed(4),
    colorFn: (v) => v > 0 ? 'var(--color-green)' : 'var(--color-red)',
  },
  {
    key: 'gamma',
    label: 'Gamma',
    symbol: 'Γ',
    description: 'Rate of change in delta per $1 move in stock',
    format: (v) => v.toFixed(6),
    colorFn: () => 'var(--color-blue)',
  },
  {
    key: 'theta',
    label: 'Theta',
    symbol: 'Θ',
    description: 'Daily time decay ($ per calendar day)',
    format: (v) => `${v >= 0 ? '+' : ''}$${v.toFixed(4)}`,
    colorFn: (v) => v < 0 ? 'var(--color-red)' : 'var(--color-green)',
  },
  {
    key: 'vega',
    label: 'Vega',
    symbol: 'V',
    description: 'Price change per 1% increase in implied volatility',
    format: (v) => `$${v.toFixed(4)}`,
    colorFn: () => 'var(--color-yellow)',
  },
  {
    key: 'rho',
    label: 'Rho',
    symbol: 'ρ',
    description: 'Price change per 1% increase in risk-free rate',
    format: (v) => `${v >= 0 ? '+' : ''}$${v.toFixed(4)}`,
    colorFn: (v, type) => type === 'call'
      ? (v > 0 ? 'var(--color-green)' : 'var(--color-red)')
      : (v < 0 ? 'var(--color-green)' : 'var(--color-red)'),
  },
];

export default function GreeksDisplay({ greeks, optionType }: Props) {
  return (
    <div className="greeks-grid">
      {GREEKS_META.map(({ key, label, symbol, description, format, colorFn }) => {
        const value = greeks[key];
        const barPct = Math.min(100, Math.abs(value) * (key === 'delta' ? 100 : key === 'gamma' ? 10000 : 50));
        return (
          <div key={key} className="greek-card">
            <div className="greek-header">
              <span className="greek-symbol">{symbol}</span>
              <span className="greek-label">{label}</span>
              <span
                className="greek-value"
                style={{ color: colorFn(value, optionType) }}
              >
                {format(value)}
              </span>
            </div>
            <div className="greek-bar-track">
              <div
                className="greek-bar-fill"
                style={{
                  width: `${barPct}%`,
                  backgroundColor: colorFn(value, optionType),
                }}
              />
            </div>
            <div className="greek-description">{description}</div>
          </div>
        );
      })}
    </div>
  );
}
