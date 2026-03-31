import { useState, useEffect, useCallback, useRef } from 'react';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiOptions {
  autoFetch?: boolean;  // Fetch on mount (default: true)
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: UseApiOptions = {},
) {
  const { autoFetch = true } = options;
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: autoFetch,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async () => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const data = await fetcher();
      setState({ data, loading: false, error: null });
      return data;
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const message = err.message || 'An error occurred';
      setState(prev => ({ ...prev, loading: false, error: message }));
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoFetch) {
      execute();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [execute, autoFetch]);

  const refetch = useCallback(() => execute(), [execute]);

  return {
    ...state,
    refetch,
  };
}
