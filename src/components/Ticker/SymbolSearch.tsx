import { useState, useEffect, useRef } from 'react';
import { ticker as tickerApi } from '../../api/client';
import type { SymbolSearchResult } from '../../api/types';

interface Props {
  onSelect: (symbol: string, name: string) => void;
}

export default function SymbolSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await tickerApi.search(query.trim());
        setResults(data.slice(0, 8));
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleSelect(r: SymbolSearchResult) {
    setQuery(r.symbol);
    setOpen(false);
    onSelect(r.symbol, r.name);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && query.trim()) {
      setOpen(false);
      onSelect(query.trim().toUpperCase(), query.trim().toUpperCase());
    }
  }

  return (
    <div className="symbol-search" ref={containerRef}>
      <div className="symbol-search-input-wrap">
        <span className="symbol-search-icon">⌕</span>
        <input
          className="symbol-search-input"
          type="text"
          placeholder="Search symbol or company… (e.g. AAPL, Tesla)"
          value={query}
          onChange={e => setQuery(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <span className="symbol-search-spinner" />}
      </div>

      {open && results.length > 0 && (
        <div className="symbol-search-dropdown">
          {results.map(r => (
            <button
              key={`${r.symbol}-${r.exchange}`}
              className="symbol-search-result"
              onClick={() => handleSelect(r)}
            >
              <span className="symbol-search-result-symbol">{r.symbol}</span>
              <span className="symbol-search-result-name">{r.name}</span>
              <span className="symbol-search-result-meta">{r.type} · {r.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
