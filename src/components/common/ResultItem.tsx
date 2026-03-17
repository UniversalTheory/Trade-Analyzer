interface Props {
  label: string;
  value: React.ReactNode;
  sub?: string;
  valueClass?: string;
  itemClass?: string;
}

export default function ResultItem({ label, value, sub, valueClass = '', itemClass = '' }: Props) {
  return (
    <div className={`result-item ${itemClass}`}>
      <div className="result-item-label">{label}</div>
      <div className={`result-item-value ${valueClass}`}>{value}</div>
      {sub && <div className="result-item-sub">{sub}</div>}
    </div>
  );
}
