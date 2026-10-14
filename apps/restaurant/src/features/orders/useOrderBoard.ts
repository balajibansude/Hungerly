import { useCallback } from 'react';

import { useActiveBranch } from '@/features/branch/useActiveBranch';
import { useServices } from '@/services';

import { loadOrders } from './operations';
import { useOrdersStore } from './store';
import { useNow, usePolling } from './usePolling';

export { useNow };

/** Drives the live order board: loads on mount, refreshes every 20 s while focused. */
export function useOrderBoard() {
  const { branchId } = useActiveBranch();
  const { orders: service } = useServices();
  const load = useOrdersStore((s) => s.load);
  const refreshing = useOrdersStore((s) => s.refreshing);
  const orders = useOrdersStore((s) => Object.values(s.byId));

  const doLoad = useCallback(
    (mode: 'initial' | 'refresh') => {
      if (!branchId) return;
      loadOrders(service, branchId, mode).catch(() => undefined);
    },
    [branchId, service],
  );

  const refresh = useCallback(() => doLoad('refresh'), [doLoad]);
  const retry = useCallback(() => doLoad('initial'), [doLoad]);

  usePolling(refresh);

  return { orders, load, refreshing, refresh, retry };
}
