import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { activeMembership, useSessionStore } from '@/features/auth/session';
import { useServices } from '@/services';

import { loadOrders } from './operations';
import { useOrdersStore } from './store';

/**
 * The active restaurant's orders for the board. Loads once, then quietly refreshes each
 * time the screen regains focus (no live updates in the prototype); `refresh` is for
 * pull-to-refresh and retry.
 */
export function useOrderBoard() {
  const { orders: service } = useServices();
  const restaurantId = useSessionStore((s) => activeMembership(s.session)?.restaurantId ?? null);
  const byId = useOrdersStore((s) => s.byId);
  const load = useOrdersStore((s) => s.load);
  const refreshing = useOrdersStore((s) => s.refreshing);

  useFocusEffect(
    useCallback(() => {
      if (!restaurantId) return;
      const { restaurantId: cachedFor, load: current } = useOrdersStore.getState();
      const fresh = cachedFor !== restaurantId || current.status === 'idle';
      void loadOrders(service, restaurantId, fresh ? 'initial' : 'refresh');
    }, [service, restaurantId]),
  );

  const refresh = useCallback(() => {
    if (restaurantId) void loadOrders(service, restaurantId, 'refresh');
  }, [service, restaurantId]);
  const retry = useCallback(() => {
    if (restaurantId) void loadOrders(service, restaurantId, 'initial');
  }, [service, restaurantId]);

  return { orders: Object.values(byId), load, refreshing, refresh, retry };
}

/** The current time, updated every 30 s so waiting and prep timers stay current. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
