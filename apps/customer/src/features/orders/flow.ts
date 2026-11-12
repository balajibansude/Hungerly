import type { Id, OrderSummary } from '@hungerly/types';

import {
  hasUnsavedInstructions,
  toOrderInstructions,
  type OrderInstructionsDraft,
} from '@/features/instructions/store';
import type { OrderService, PlaceOrderInput } from '@/services';

/**
 * After checkout: Order confirmation → Instructions → Order tracking. Every screen is keyed
 * by the id of the order that was just created, so instructions attach to that order only.
 */
export const orderRoutes = {
  confirmation: (id: Id) => ({ pathname: '/order/[id]/confirmation' as const, params: { id } }),
  instructions: (id: Id) => ({ pathname: '/order/[id]/instructions' as const, params: { id } }),
  tracking: (id: Id) => ({ pathname: '/order/[id]/tracking' as const, params: { id } }),
};

export type OrderRoute = ReturnType<(typeof orderRoutes)[keyof typeof orderRoutes]>;

/**
 * Places the order exactly once and moves on to its confirmation. The cart is cleared only
 * after the order exists (so a failure keeps the cart intact), which also means a second
 * tap can't place the same cart twice.
 */
export async function placeOrderAndConfirm(deps: {
  orders: Pick<OrderService, 'placeOrder'>;
  input: PlaceOrderInput;
  recordOrder: (order: OrderSummary) => void;
  clearCart: () => void;
  /** Replaces the cart in the stack, so Back can't return to a cart that was already ordered. */
  replace: (route: OrderRoute) => void;
}): Promise<OrderSummary> {
  const order = await deps.orders.placeOrder(deps.input);
  deps.recordOrder(order);
  // Leave the cart first so it never flashes its empty state, then empty it.
  deps.replace(orderRoutes.confirmation(order.id));
  deps.clearCart();
  return order;
}

/**
 * "Continue to tracking": saves this order's instructions if there are unsaved edits, then
 * opens tracking. Only `saveInstructions` is called — never `placeOrder` or a payment. On
 * failure nothing is navigated and the draft is kept, so the customer can retry.
 */
export async function saveInstructionsAndTrack(deps: {
  orderId: Id;
  draft: OrderInstructionsDraft;
  orders: Pick<OrderService, 'saveInstructions'>;
  markSaved: (orderId: Id, revision: number, savedAt: string) => void;
  replace: (route: OrderRoute) => void;
  now?: () => Date;
}): Promise<'saved' | 'nothing_to_save'> {
  const { orderId, draft } = deps;
  let result: 'saved' | 'nothing_to_save' = 'nothing_to_save';
  if (hasUnsavedInstructions(draft)) {
    await deps.orders.saveInstructions(orderId, toOrderInstructions(draft));
    deps.markSaved(orderId, draft.revision, (deps.now?.() ?? new Date()).toISOString());
    result = 'saved';
  }
  deps.replace(orderRoutes.tracking(orderId));
  return result;
}

/**
 * "Skip for now": opens tracking without saving anything. Instructions are optional, but
 * unsaved edits are never dropped silently — the customer is asked first via
 * `confirmDiscard`, which receives the navigation to run if they agree.
 */
export function skipInstructions(deps: {
  orderId: Id;
  draft: OrderInstructionsDraft;
  replace: (route: OrderRoute) => void;
  confirmDiscard: (proceed: () => void) => void;
}): 'skipped' | 'confirm_needed' {
  const proceed = () => deps.replace(orderRoutes.tracking(deps.orderId));
  if (hasUnsavedInstructions(deps.draft)) {
    deps.confirmDiscard(proceed);
    return 'confirm_needed';
  }
  proceed();
  return 'skipped';
}
