import { useEffect } from 'react';

export function useBackgroundSync(dataLoader: any, user: any) {
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      try {
        // Update cache silently in background
        await Promise.all([
          dataLoader.loadGroups(),
          dataLoader.loadForwarding()
        ]);
      } catch (error) {
        console.warn('Background sync failed:', error);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [dataLoader, user]);
}