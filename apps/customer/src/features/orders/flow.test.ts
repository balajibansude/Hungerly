import type { CartItem, OrderSummary } from '@hungerly/types';
import { money } from '@hungerly/utils';

import { EMPTY_DRAFT, useInstructionsStore } from '@/features/instructions/store';
import type { OrderInstructions, PlaceOrderInput } from '@/services';

import {
  orderRoutes,
  placeOrderAndConfirm,
  saveInstructionsAndTrack,
  skipInstructions,
} from './flow';

const item: CartItem = {
  lineId: 'f-1',
  foodId: 'f-1',
  restaurantId: 'r-1',
  name: 'Masala dosa',
  foodType: 'veg',
  basePrice: money(12000),
  selectedOptions: [],
  quantity: 2,
};

const input: PlaceOrderInput = {
  restaurantId: 'r-1',
  items: [item],
  deliveryAddressId: 'a-1',
  paymentMethod: 'cod',
  total: money(26500),
};

const order: OrderSummary = {
  id: 'ord-42',
  orderNumber: 'SW1042',
  restaurantId: 'r-1',
  restaurantName: 'The Dosa Republic',
  status: 'placed',
  lines: [{ name: 'Masala dosa', quantity: 2, lineTotal: money(24000) }],
  total: money(26500),
  placedAt: '2026-11-10T10:00:00.000Z',
};

/** A fake order service that records every call, so tests can prove what was (not) called. */
function fakeOrders({ failSave = false, failPlace = false } = {}) {
  const calls: { placeOrder: PlaceOrderInput[]; saveInstructions: [string, OrderInstructions][] } =
    { placeOrder: [], saveInstructions: [] };
  return {
    calls,
    placeOrder: jest.fn(async (i: PlaceOrderInput) => {
      calls.placeOrder.push(i);
      if (failPlace) throw new Error('network');
      return order;
    }),
    saveInstructions: jest.fn(async (orderId: string, instructions: OrderInstructions) => {
      calls.saveInstructions.push([orderId, instructions]);
      if (failSave) throw new Error('network');
    }),
  };
}

const draftOf = (orderId: string) =>
  useInstructionsStore.getState().byOrder[orderId] ?? EMPTY_DRAFT;

afterEach(() => useInstructionsStore.getState().reset());

describe('placeOrderAndConfirm', () => {
  it('places one order, records it, clears the cart and opens its confirmation', async () => {
    const orders = fakeOrders();
    const recordOrder = jest.fn();
    const clearCart = jest.fn();
    const replace = jest.fn();

    await expect(
      placeOrderAndConfirm({ orders, input, recordOrder, clearCart, replace }),
    ).resolves.toBe(order);

    expect(orders.placeOrder).toHaveBeenCalledTimes(1);
    expect(recordOrder).toHaveBeenCalledWith(order);
    expect(clearCart).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith({
      pathname: '/order/[id]/confirmation',
      params: { id: 'ord-42' },
    });
  });

  it('keeps the cart and stays put when the order fails', async () => {
    const orders = fakeOrders({ failPlace: true });
    const clearCart = jest.fn();
    const replace = jest.fn();

    await expect(
      placeOrderAndConfirm({ orders, input, recordOrder: jest.fn(), clearCart, replace }),
    ).rejects.toThrow('network');
    expect(clearCart).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('saveInstructionsAndTrack', () => {
  const run = (orders: ReturnType<typeof fakeOrders>, replace = jest.fn()) =>
    saveInstructionsAndTrack({
      orderId: order.id,
      draft: draftOf(order.id),
      orders,
      markSaved: useInstructionsStore.getState().markSaved,
      replace,
      now: () => new Date('2026-11-10T10:05:00.000Z'),
    });

  it('saves both sections against the placed order, separately, then opens tracking', async () => {
    const s = useInstructionsStore.getState();
    s.toggleOption(order.id, 'restaurant', 'less_spicy');
    s.toggleOption(order.id, 'restaurant', 'no_onion');
    s.setNote(order.id, 'restaurant', 'No coriander');
    s.toggleOption(order.id, 'delivery', 'leave_at_door');
    s.setVoiceNote(order.id, 'delivery', { durationSeconds: 9 });
    const orders = fakeOrders();
    const replace = jest.fn();

    await expect(run(orders, replace)).resolves.toBe('saved');

    expect(orders.calls.saveInstructions).toEqual([
      [
        'ord-42',
        {
          restaurant: {
            options: ['less_spicy', 'no_onion'],
            note: 'No coriander',
            voiceNote: null,
          },
          delivery: { options: ['leave_at_door'], note: '', voiceNote: { durationSeconds: 9 } },
        },
      ],
    ]);
    // Saving instructions never places another order (and so never starts a payment).
    expect(orders.placeOrder).not.toHaveBeenCalled();
    expect(draftOf(order.id)).toMatchObject({ dirty: false, savedAt: '2026-11-10T10:05:00.000Z' });
    expect(replace).toHaveBeenCalledWith(orderRoutes.tracking('ord-42'));
  });

  it('goes straight to tracking without a request when there is nothing to save', async () => {
    const orders = fakeOrders();
    const replace = jest.fn();

    await expect(run(orders, replace)).resolves.toBe('nothing_to_save');
    expect(orders.saveInstructions).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith({
      pathname: '/order/[id]/tracking',
      params: { id: 'ord-42' },
    });
  });

  it('does not save again once saved', async () => {
    useInstructionsStore.getState().toggleOption(order.id, 'delivery', 'no_bell');
    const orders = fakeOrders();
    await run(orders);
    await run(orders);
    expect(orders.saveInstructions).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft and does not navigate when saving fails', async () => {
    useInstructionsStore.getState().toggleOption(order.id, 'delivery', 'handle_with_care');
    const orders = fakeOrders({ failSave: true });
    const replace = jest.fn();

    await expect(run(orders, replace)).rejects.toThrow('network');
    expect(replace).not.toHaveBeenCalled();
    expect(draftOf(order.id)).toMatchObject({
      dirty: true,
      savedAt: null,
      delivery: { options: ['handle_with_care'] },
    });
  });
});

describe('skipInstructions', () => {
  it('goes straight to tracking when there is nothing unsaved', () => {
    const replace = jest.fn();
    const confirmDiscard = jest.fn();

    expect(
      skipInstructions({ orderId: order.id, draft: draftOf(order.id), replace, confirmDiscard }),
    ).toBe('skipped');
    expect(replace).toHaveBeenCalledWith(orderRoutes.tracking('ord-42'));
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it('asks before dropping unsaved instructions, and only leaves once confirmed', () => {
    useInstructionsStore.getState().toggleOption(order.id, 'restaurant', 'no_garlic');
    const replace = jest.fn();
    let proceed: (() => void) | undefined;

    expect(
      skipInstructions({
        orderId: order.id,
        draft: draftOf(order.id),
        replace,
        confirmDiscard: (p) => (proceed = p),
      }),
    ).toBe('confirm_needed');
    expect(replace).not.toHaveBeenCalled();
    // Skipping never deletes the draft by itself.
    expect(draftOf(order.id).restaurant.options).toEqual(['no_garlic']);

    proceed?.();
    expect(replace).toHaveBeenCalledWith(orderRoutes.tracking('ord-42'));
  });
});
