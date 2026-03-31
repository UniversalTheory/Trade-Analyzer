interface CacheEntry<T> {
  data: T;
  expiry: number;
}

export class TTLCache {
  private store = new Map<string, CacheEntry<unknown>>();

  // Default TTLs in milliseconds
  static readonly TTL = {
    QUOTE: 60 * 1000,         // 1 minute
    NEWS: 5 * 60 * 1000,      // 5 minutes
    SECTOR: 15 * 60 * 1000,   // 15 minutes
    MOVERS: 2 * 60 * 1000,    // 2 minutes
    OPTIONS: 5 * 60 * 1000,   // 5 minutes
    HISTORY: 15 * 60 * 1000,  // 15 minutes
    SEARCH: 60 * 60 * 1000,   // 1 hour
  } as const;

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiry: Date.now() + ttlMs,
    });
  }

  clear(): void {
    this.store.clear();
  }

  // Remove expired entries
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiry) {
        this.store.delete(key);
      }
    }
  }

  get size(): number {
    return this.store.size;
  }
}

// Singleton cache instance
export const cache = new TTLCache();
