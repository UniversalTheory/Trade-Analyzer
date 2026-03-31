import type { SectorDefinition } from '../../api/types';

interface Props {
  sectors: SectorDefinition[];
  selectedId: string;
  onChange: (id: string) => void;
}

export default function SectorSelector({ sectors, selectedId, onChange }: Props) {
  const broad = sectors.filter(s => s.category === 'broad');
  const sub   = sectors.filter(s => s.category === 'sub-sector');

  return (
    <div className="sector-selector-wrapper">
      <label className="sector-selector-label">Select Sector</label>
      <select
        className="sector-select"
        value={selectedId}
        onChange={e => onChange(e.target.value)}
      >
        <option value="" disabled>Choose a sector…</option>
        <optgroup label="── S&P 500 Sectors ──">
          {broad.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.etf})
            </option>
          ))}
        </optgroup>
        <optgroup label="── Sub-Sectors ──">
          {sub.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.etf})
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
