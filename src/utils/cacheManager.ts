/**
 * In-memory and SessionStorage Cache with TTL
 * Point 16: Caching static or slow-changing data
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class CacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 15 * 60 * 1000; // 15 minutes default

  /**
   * Store data in cache with a TTL in milliseconds
   */
  set<T>(key: string, data: T, ttlMs: number = this.defaultTTL): void {
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
   * Retrieve cached data if not expired
   */
  get<T>(key: string): T | null {
    const now = Date.now();

    // Check memory first
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (now < memEntry.expiresAt) {
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
   * Get or compute if missing
   */
  async getOrSet<T>(key: string, fetchFn: () => Promise<T>, ttlMs: number = this.defaultTTL): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await fetchFn();
    this.set<T>(key, fresh, ttlMs);
    return fresh;
  }

  /**
   * Invalidate specific key
   */
  delete(key: string): void {
    this.memoryCache.delete(key);
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

export const appCache = new CacheManager();
