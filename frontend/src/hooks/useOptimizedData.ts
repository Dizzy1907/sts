import { useState, useCallback } from 'react';
import { useCache } from './useCache';
import { itemsAPI, groupsAPI, historyAPI, forwardingAPI } from '../services/api';

export function useOptimizedData(user: any) {
  const cache = useCache();
  const [loading, setLoading] = useState(false);

  // Lazy load data only when needed
  const loadItems = useCallback(async (page = 1, filters = {}) => {
    const cacheKey = `items-${page}-${JSON.stringify(filters)}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = await itemsAPI.getAll(page, 100, filters);
    cache.set(cacheKey, result.data, 15000); // 15s cache
    return result.data;
  }, [cache]);

  const loadGroups = useCallback(async () => {
    const cached = cache.get('groups');
    if (cached) return cached;

    const result = await groupsAPI.getAll();
    cache.set('groups', result.data, 30000); // 30s cache
    return result.data;
  }, [cache]);

  const loadHistory = useCallback(async (params = {}) => {
    const cacheKey = `history-${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const result = await historyAPI.getAll(params);
    cache.set(cacheKey, result.data, 10000); // 10s cache
    return result.data;
  }, [cache]);

  const loadForwarding = useCallback(async () => {
    if (!['admin', 'storage', 'surgery', 'msu'].includes(user?.role)) return [];
    
    const cached = cache.get('forwarding');
    if (cached) return cached;

    const result = user.role === 'admin' 
      ? await forwardingAPI.getAll()
      : await forwardingAPI.getPending();
    
    cache.set('forwarding', result.data, 5000); // 5s cache for real-time data
    return result.data;
  }, [cache, user?.role]);

  const invalidateCache = useCallback((keys?: string[]) => {
    if (keys) {
      keys.forEach(key => cache.clear(key));
    } else {
      cache.clear();
    }
  }, [cache]);

  return {
    loadItems,
    loadGroups, 
    loadHistory,
    loadForwarding,
    invalidateCache,
    loading,
    setLoading
  };
}