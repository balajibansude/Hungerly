import { isServiceError } from '@hungerly/app-core';
import type { CartItem } from '@hungerly/types';
import { money } from '@hungerly/utils';

import { defaultAddress, restaurants, workAddress } from '../../mock';
import type { OrderInstructions, PlaceOrderInput } from '../contracts';
import { createMockServices } from './index';

const openRestaurant = restaurants.find((r) => r.isOpen)!;
const closedRestaurant = restaurants.find((r) => !r.isOpen)!;

const item = (restaurantId: string): CartItem => ({
  lineId: 'f-1',
  foodId: 'f-1',
  restaurantId,
  name: 'Paneer tikka',
  foodType: 'veg',
  basePrice: money(20000),
  selectedOptions: [],
  quantity: 2,
});

const input = (overrides: Partial<PlaceOrderInput> = {}): PlaceOrderInput => ({
  restaurantId: openRestaurant.id,
  items: [item(openRestaurant.id)],
  deliveryAddressId: defaultAddress.id,
  paymentMethod: 'cod',
  total: money(42500),
  ...overrides,
});

const instructions: OrderInstructions = {
  restaurant: { options: ['less_spicy'], note: '', voiceNote: null },
  delivery: { options: ['no_bell'], note: 'Gate 2', voiceNote: { durationSeconds: 5 } },
};

describe('mock order service', () => {
  it('places an order and lists it', async () => {
    const { orders } = createMockServices({ latencyMs: 0 });
    const order = await orders.placeOrder(input());

    expect(order).toMatchObject({
      restaurantId: openRestaurant.id,
      restaurantName: openRestaurant.name,
      status: 'placed',
      total: money(42500),
      lines: [{ name: 'Paneer tikka', quantity: 2, lineTotal: money(40000) }],
    });
    expect((await orders.listOrders()).items.map((o) => o.id)).toEqual([order.id]);
  });

  it('saves a snapshot of the chosen delivery address with the order', async () => {
    const { orders } = createMockServices({ latencyMs: 0 });
    const order = await orders.placeOrder(input({ deliveryAddressId: workAddress.id }));

    const { id: _id, ...expected } = workAddress;
    expect(order.deliveryAddress).toEqual(expected);
    expect((await orders.listOrders()).items[0]!.deliveryAddress).toEqual(expected);
  });

  it('keeps the order address unchanged when the saved address is edited or removed', async () => {
    const { orders, location } = createMockServices({ latencyMs: 0 });
    const order = await orders.placeOrder(input({ deliveryAddressId: workAddress.id }));
    const { id: _id, ...snapshot } = workAddress;

    await location.saveAddress({
      id: workAddress.id,
      label: 'other',
      line1: 'New Building 9',
      locality: 'Baner',
      city: 'Pune',
      postalCode: '411045',
      location: { lat: 18.56, lng: 73.78 },
    });
    expect(order.deliveryAddress).toEqual(snapshot);
    expect((await orders.listOrders()).items[0]!.deliveryAddress).toEqual(snapshot);

    await location.deleteAddress(workAddress.id);
    expect(order.deliveryAddress).toEqual(snapshot);
    expect((await orders.listOrders()).items[0]!.deliveryAddress).toEqual(snapshot);
  });

  it('rejects an order for an address that no longer exists', async () => {
    const { orders } = createMockServices({ latencyMs: 0 });
    const error = await orders.placeOrder(input({ deliveryAddressId: 'a-missing' })).then(
      () => null,
      (e: unknown) => e,
    );
    expect(isServiceError(error)).toBe(true);
    expect((await orders.listOrders()).items).toHaveLength(0);
  });

  it('gives each order its own id and number', async () => {
    const { orders } = createMockServices({ latencyMs: 0 });
    const a = await orders.placeOrder(input());
    const b = await orders.placeOrder(input());
    expect(a.id).not.toBe(b.id);
    expect(a.orderNumber).not.toBe(b.orderNumber);
  });

  it('rejects closed restaurants, empty carts and online payment', async () => {
    const { orders } = createMockServices({ latencyMs: 0 });
    const attempts = [
      input({ restaurantId: closedRestaurant.id, items: [item(closedRestaurant.id)] }),
      input({ items: [] }),
      input({ paymentMethod: 'online' }),
    ];
    for (const attempt of attempts) {
      const error = await orders.placeOrder(attempt).then(
        () => null,
        (e: unknown) => e,
      );
      expect(isServiceError(error)).toBe(true);
    }
    expect((await orders.listOrders()).items).toHaveLength(0);
  });

  it('saves instructions to an existing order without creating another one', async () => {
    const { orders } = createMockServices({ latencyMs: 0 });
    const order = await orders.placeOrder(input());

    await expect(orders.saveInstructions(order.id, instructions)).resolves.toBeUndefined();
    // Saving again replaces the previous instructions; still exactly one order.
    await expect(orders.saveInstructions(order.id, instructions)).resolves.toBeUndefined();
    expect((await orders.listOrders()).items).toHaveLength(1);
  });

  it('refuses instructions for an unknown order', async () => {
    const { orders } = createMockServices({ latencyMs: 0 });
    await expect(orders.saveInstructions('ord-missing', instructions)).rejects.toMatchObject({
      code: 'not_found',
    });
  });
});
