interface Props {
  rows?: number;
  height?: number;
}

export default function LoadingState({ rows = 3, height = 60 }: Props) {
  return (
    <div className="loading-state">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="loading-skeleton"
          style={{ height, opacity: 1 - i * 0.15 }}
        />
      ))}
    </div>
  );
}
