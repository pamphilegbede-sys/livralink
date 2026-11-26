/**
 * Bounded LRU + TTL Cache backed by in-memory Map and SessionStorage
 * Point 16: Caching static or slow-changing data without unbounded memory growth
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class CacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private inFlight = new Map<string, Promise<any>>();
  private defaultTTL = 15 * 60 * 1000; // 15 minutes default
  private readonly maxEntries: number;

  constructor(maxEntries = 150) {
    this.maxEntries = maxEntries;
  }

  private evictIfNeeded(): void {
    if (this.memoryCache.size < this.maxEntries) return;
    const now = Date.now();
    for (const [k, v] of this.memoryCache.entries()) {
      if (now >= v.expiresAt) {
        this.memoryCache.delete(k);
      }
    }
    while (this.memoryCache.size >= this.maxEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.memoryCache.delete(oldestKey);
    }
  }

  /**
   * Store data in cache with a TTL in milliseconds (LRU promotion)
   */
  set<T>(key: string, data: T, ttlMs: number = this.defaultTTL): void {
    if (this.memoryCache.has(key)) {
      this.memoryCache.delete(key);
    } else {
      this.evictIfNeeded();
    }

    const entry: CacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttlMs,
    };
    this.memoryCache.set(key, entry);

    // Also persist in sessionStorage when available
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(`livralink_cache_${key}`, JSON.stringify(entry));
      }
    } catch {}
  }

  /**
   * Retrieve cached data if not expired (promotes to MRU)
   */
  get<T>(key: string): T | null {
    const now = Date.now();

    // Check memory first
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (now < memEntry.expiresAt) {
        this.memoryCache.delete(key);
        this.memoryCache.set(key, memEntry);
        return memEntry.data as T;
      }
      this.memoryCache.delete(key);
    }

    // Check sessionStorage fallback
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const stored = window.sessionStorage.getItem(`livralink_cache_${key}`);
        if (stored) {
          const entry: CacheEntry<T> = JSON.parse(stored);
          if (now < entry.expiresAt) {
            this.evictIfNeeded();
            this.memoryCache.set(key, entry); // Hydrate memory cache
            return entry.data;
          }
          window.sessionStorage.removeItem(`livralink_cache_${key}`);
        }
      }
    } catch {}

    return null;
  }

  /**
   * Get or compute if missing (with concurrent in-flight deduplication)
   */
  async getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttlMs: number = this.defaultTTL): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    const promise = fetchFn()
      .then((fresh) => {
        this.set<T>(key, fresh, ttlMs);
        return fresh;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  size(): number {
    return this.memoryCache.size;
  }

  /**
   * Invalidate specific key
   */
  delete(key: string): void {
    this.memoryCache.delete(key);
    this.inFlight.delete(key);
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem(`livralink_cache_${key}`);
      }
    } catch {}
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.memoryCache.clear();
    this.inFlight.clear();
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith('livralink_cache_')) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
      }
    } catch {}
  }
}

export const appCache = new CacheManager(150);
export { CacheManager };
