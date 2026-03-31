interface Props {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({ message = 'Failed to load data', onRetry }: Props) {
  return (
    <div className="error-state">
      <span className="error-state-icon">⚠</span>
      <span className="error-state-msg">{message}</span>
      {onRetry && (
        <button className="error-state-retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
