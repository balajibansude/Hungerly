import { isServiceError, userMessage } from '@hungerly/app-core';
import type { Id, OrderRejectReason, PartnerOrder } from '@hungerly/types';

import type { OrderService } from '@/services';

import { useOrdersStore } from './store';

/**
 * Order operations: the only code that moves orders between the OrderService and the
 * orders store. Plain functions (no React), so they are tested directly.
 */

const store = () => useOrdersStore.getState();

/** Loads the board. `refresh` keeps the current orders on screen while it runs. */
export async function loadOrders(
  service: OrderService,
  restaurantId: Id,
  mode: 'initial' | 'refresh' = 'initial',
): Promise<void> {
  store().startLoading(restaurantId, mode);
  try {
    store().loaded(restaurantId, await service.list(restaurantId));
  } catch (error) {
    store().loadFailed(userMessage(error));
  }
}

/** Fetches one order (e.g. opened from a link) into the cache. */
export async function fetchOrder(
  service: OrderService,
  restaurantId: Id,
  orderId: Id,
): Promise<PartnerOrder> {
  const order = await service.get(restaurantId, orderId);
  store().upsert(order);
  return order;
}

export type OrderActionInput =
  | { action: 'accept'; prepMinutes: number }
  | { action: 'reject'; reason: OrderRejectReason }
  | { action: 'markReady' };

export type OrderActionOutcome =
  | { ok: true; order: PartnerOrder }
  | { ok: false; reason: 'busy' }
  | { ok: false; reason: 'failed'; message: string };

/** Errors meaning our copy of the order is out of date. */
const STALE_CODES = new Set(['order.invalid_transition', 'order.version_conflict', 'not_found']);

/**
 * Runs accept / reject / mark ready against the version on screen. Ignores a second tap
 * while one is in flight. When the service reports the order changed elsewhere, the
 * latest copy is fetched so the screen shows what actually happened.
 */
export async function performOrderAction(
  service: OrderService,
  restaurantId: Id,
  orderId: Id,
  input: OrderActionInput,
): Promise<OrderActionOutcome> {
  const current = store().byId[orderId];
  if (store().pending[orderId]) return { ok: false, reason: 'busy' };
  if (!current)
    return { ok: false, reason: 'failed', message: 'This order is no longer available.' };

  store().setPending(orderId, input.action);
  const expectedVersion = current.version;
  try {
    const order =
      input.action === 'accept'
        ? await service.accept(restaurantId, orderId, {
            prepMinutes: input.prepMinutes,
            expectedVersion,
          })
        : input.action === 'reject'
          ? await service.reject(restaurantId, orderId, { reason: input.reason, expectedVersion })
          : await service.markReady(restaurantId, orderId, { expectedVersion });
    store().upsert(order);
    return { ok: true, order };
  } catch (error) {
    if (isServiceError(error) && STALE_CODES.has(error.code)) {
      try {
        await fetchOrder(service, restaurantId, orderId);
      } catch (refetchError) {
        if (isServiceError(refetchError) && refetchError.code === 'not_found') {
          store().remove(orderId);
        }
      }
    }
    return { ok: false, reason: 'failed', message: userMessage(error) };
  } finally {
    store().setPending(orderId, null);
  }
}
