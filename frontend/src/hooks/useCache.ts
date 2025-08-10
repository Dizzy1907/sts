import { useCallback, useRef } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

export function useCache<T>(defaultExpiry = 30000) { // 30 seconds
  const cache = useRef<Map<string, CacheEntry<T>>>(new Map());

  const get = useCallback((key: string): T | null => {
    const entry = cache.current.get(key);
    if (!entry || Date.now() > entry.timestamp + entry.expiry) {
      cache.current.delete(key);
      return null;
    }
    return entry.data;
  }, []);

  const set = useCallback((key: string, data: T, expiry = defaultExpiry) => {
    cache.current.set(key, {
      data,
      timestamp: Date.now(),
      expiry
    });
  }, [defaultExpiry]);

  const clear = useCallback((key?: string) => {
    if (key) {
      cache.current.delete(key);
    } else {
      cache.current.clear();
    }
  }, []);

  return { get, set, clear };
}