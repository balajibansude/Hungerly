import { useCallback, useEffect } from 'react';
import { useShallow } from 'zustand/shallow';

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
  // useShallow prevents a new array reference on every snapshot call. Without it,
  // Object.values() would always return a new array and React would throw
  // "The result of getSnapshot should be cached to avoid an infinite loop."
  const orders = useOrdersStore(useShallow((s) => Object.values(s.byId)));

  const doLoad = useCallback(
    (mode: 'initial' | 'refresh') => {
      if (!branchId) return;
      loadOrders(service, branchId, mode).catch(() => undefined);
    },
    [branchId, service],
  );

  const refresh = useCallback(() => doLoad('refresh'), [doLoad]);
  const retry = useCallback(() => doLoad('initial'), [doLoad]);

  // Trigger the initial fetch on mount and whenever the active branch changes.
  // doLoad is recreated only when branchId or service change, so this effect runs
  // exactly when a new restaurant context is entered — not on every render.
  useEffect(() => {
    doLoad('initial');
  }, [doLoad]);

  usePolling(refresh);

  return { orders, load, refreshing, refresh, retry };
}
