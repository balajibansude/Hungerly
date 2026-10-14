import { isApiError, type Order } from '@hungerly/api-client';

import { errorMessage } from '@/lib/errors';
import type { OrderService } from '@/services';

import type { RejectReason } from './format';
import { useOrdersStore } from './store';

export type OrderActionInput =
  | { action: 'accept'; prepMinutes: number }
  | { action: 'reject'; reason: RejectReason }
  | { action: 'markReady' };

export type OrderActionOutcome =
  | { ok: true; order: Order }
  | { ok: false; reason: 'busy' }
  | { ok: false; reason: 'failed'; message: string };

const STALE_CODES = new Set([
  'order.invalid_transition',
  'order.version_conflict',
  'not_found',
  'conflict',
]);

export async function loadOrders(
  service: OrderService,
  branchId: string,
  mode: 'initial' | 'refresh' = 'initial',
): Promise<void> {
  const store = useOrdersStore.getState();
  store.startLoading(branchId, mode);
  try {
    const page = await service.list(branchId, {});
    store.setOrders(page.items, branchId);
  } catch (error) {
    store.setLoadError(errorMessage(error));
  }
}

export async function fetchOrder(
  service: OrderService,
  branchId: string,
  orderId: string,
): Promise<void> {
  const order = await service.get(branchId, orderId);
  useOrdersStore.getState().setOrder(order);
}

export async function performOrderAction(
  service: OrderService,
  branchId: string,
  orderId: string,
  input: OrderActionInput,
): Promise<OrderActionOutcome> {
  const store = useOrdersStore.getState();

  if (store.pending[orderId]) return { ok: false, reason: 'busy' };

  const cached = store.byId[orderId];
  if (!cached) return { ok: false, reason: 'failed', message: 'Order not found.' };

  store.setPending(orderId, true);
  try {
    const updated =
      input.action === 'accept'
        ? await service.accept(branchId, orderId, {
            prepMinutes: input.prepMinutes,
            expectedVersion: cached.version,
          })
        : input.action === 'reject'
          ? await service.reject(branchId, orderId, {
              reason: input.reason,
              expectedVersion: cached.version,
            })
          : await service.markReady(branchId, orderId, { expectedVersion: cached.version });

    store.setOrder(updated);
    return { ok: true, order: updated };
  } catch (error) {
    if (isApiError(error) && STALE_CODES.has(error.code)) {
      try {
        const latest = await service.get(branchId, orderId);
        store.setOrder(latest);
      } catch {
        // Ignore secondary fetch failure.
      }
    }
    return { ok: false, reason: 'failed', message: errorMessage(error) };
  } finally {
    store.setPending(orderId, false);
  }
}
