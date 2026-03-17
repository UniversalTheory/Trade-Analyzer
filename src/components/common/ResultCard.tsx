interface Props {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function ResultCard({ title, children, className = '' }: Props) {
  return (
    <div className={`result-card ${className}`}>
      <div className="result-card-title">{title}</div>
      {children}
    </div>
  );
}
