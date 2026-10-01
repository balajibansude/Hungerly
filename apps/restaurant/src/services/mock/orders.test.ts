import { isServiceError } from '@hungerly/app-core';

import { validDraft } from '@/features/onboarding/testFixtures';
import { parseDraft } from '@/features/onboarding/validation';

import { MASALA_JUNCTION_ID } from '../../mock';
import type { Services } from '../contracts';
import { createMockServices, DEMO_PHONE_E164, PROTOTYPE_OTP } from './index';

const NOW = new Date('2026-10-02T13:00:00+05:30');
const NEW_ORDER = 'ord-4k7p2m';
const COD_NEW_ORDER = 'ord-9x3d5q';
const PREPARING = 'ord-7r1c9w';
const READY = 'ord-3h9n4k';
const CANCELLED = 'ord-4b7g3e';

async function signIn(services: Services, phoneE164 = DEMO_PHONE_E164) {
  const challenge = await services.auth.requestOtp({ channel: 'phone', phoneE164 });
  return services.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP);
}

async function demo() {
  const services = createMockServices({ latencyMs: 0, now: () => NOW });
  await signIn(services);
  return services;
}

const errorOf = (promise: Promise<unknown>) => promise.catch((e: unknown) => e);

describe('mock order service — retrieval', () => {
  it('lists the demo restaurant’s orders, newest first', async () => {
    const services = await demo();
    const orders = await services.orders.list(MASALA_JUNCTION_ID);
    expect(orders).toHaveLength(11);
    const placed = orders.map((o) => Date.parse(o.placedAt));
    expect(placed).toEqual([...placed].sort((a, b) => b - a));
  });

  it('gets one order', async () => {
    const services = await demo();
    const order = await services.orders.get(MASALA_JUNCTION_ID, NEW_ORDER);
    expect(order).toMatchObject({ orderNumber: 'HGR-4K7P2M', status: 'placed' });
  });

  it('hides orders from people who do not work at the restaurant', async () => {
    const services = createMockServices({ latencyMs: 0, now: () => NOW });
    await expect(services.orders.list(MASALA_JUNCTION_ID)).rejects.toMatchObject({
      code: 'not_found',
    });
    await signIn(services, '+919812345678');
    await expect(services.orders.get(MASALA_JUNCTION_ID, NEW_ORDER)).rejects.toMatchObject({
      code: 'not_found',
    });
  });

  it('gives a newly registered restaurant (in review) no orders', async () => {
    const services = createMockServices({ latencyMs: 0, now: () => NOW });
    await signIn(services, '+919812345678');
    const parsed = parseDraft(validDraft());
    if (!parsed.ok) throw new Error('fixture draft should be valid');
    const { restaurant } = await services.onboarding.completeRegistration(parsed.registration, 'k');
    expect(restaurant.status).toBe('pending_review');
    expect(await services.orders.list(restaurant.id)).toEqual([]);
  });
});

describe('mock order service — accept', () => {
  it('moves placed → preparing with the prep estimate', async () => {
    const services = await demo();
    const before = await services.orders.get(MASALA_JUNCTION_ID, NEW_ORDER);
    const order = await services.orders.accept(MASALA_JUNCTION_ID, NEW_ORDER, {
      prepMinutes: 25,
      expectedVersion: before.version,
    });
    expect(order.status).toBe('preparing');
    expect(order.prepMinutes).toBe(25);
    expect(order.acceptedAt).toBe(NOW.toISOString());
    expect(order.estimatedReadyAt).toBe(new Date(NOW.getTime() + 25 * 60_000).toISOString());
    expect(order.version).toBe(before.version + 1);
    expect(order.timeline[order.timeline.length - 1]).toEqual({
      fromStatus: 'placed',
      toStatus: 'preparing',
      actor: 'restaurant',
      at: NOW.toISOString(),
    });
    expect(await services.orders.get(MASALA_JUNCTION_ID, NEW_ORDER)).toEqual(order);
  });

  it('rejects prep times outside 5–90 whole minutes and leaves the order unchanged', async () => {
    const services = await demo();
    for (const prepMinutes of [0, 4, 91, 12.5]) {
      const error = await errorOf(
        services.orders.accept(MASALA_JUNCTION_ID, NEW_ORDER, { prepMinutes, expectedVersion: 1 }),
      );
      expect(isServiceError(error) && error.code).toBe('validation');
    }
    expect((await services.orders.get(MASALA_JUNCTION_ID, NEW_ORDER)).status).toBe('placed');
  });

  it('cannot accept twice or accept an order that is not new', async () => {
    const services = await demo();
    const accepted = await services.orders.accept(MASALA_JUNCTION_ID, NEW_ORDER, {
      prepMinutes: 20,
      expectedVersion: 1,
    });
    await expect(
      services.orders.accept(MASALA_JUNCTION_ID, NEW_ORDER, {
        prepMinutes: 20,
        expectedVersion: accepted.version,
      }),
    ).rejects.toMatchObject({
      code: 'order.invalid_transition',
      message: 'This order was already accepted.',
    });
    await expect(
      services.orders.accept(MASALA_JUNCTION_ID, CANCELLED, {
        prepMinutes: 20,
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ code: 'order.invalid_transition' });
  });

  it('refuses to act on a stale version', async () => {
    const services = await demo();
    await expect(
      services.orders.accept(MASALA_JUNCTION_ID, NEW_ORDER, {
        prepMinutes: 20,
        expectedVersion: 7,
      }),
    ).rejects.toMatchObject({ code: 'order.version_conflict' });
    expect((await services.orders.get(MASALA_JUNCTION_ID, NEW_ORDER)).status).toBe('placed');
  });
});

describe('mock order service — reject', () => {
  it('cancels a new order with the reason and starts a refund when paid', async () => {
    const services = await demo();
    const order = await services.orders.reject(MASALA_JUNCTION_ID, NEW_ORDER, {
      reason: 'item_out_of_stock',
      expectedVersion: 1,
    });
    expect(order).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'restaurant',
      cancellationReason: 'item_out_of_stock',
      cancelledAt: NOW.toISOString(),
      paymentStatus: 'refund_pending',
    });
  });

  it('needs no refund for an unpaid cash order', async () => {
    const services = await demo();
    const order = await services.orders.reject(MASALA_JUNCTION_ID, COD_NEW_ORDER, {
      reason: 'too_busy',
      expectedVersion: 1,
    });
    expect(order.paymentStatus).toBe('not_applicable');
  });

  it('cannot reject twice, or reject once preparing', async () => {
    const services = await demo();
    const rejected = await services.orders.reject(MASALA_JUNCTION_ID, NEW_ORDER, {
      reason: 'closing',
      expectedVersion: 1,
    });
    await expect(
      services.orders.reject(MASALA_JUNCTION_ID, NEW_ORDER, {
        reason: 'closing',
        expectedVersion: rejected.version,
      }),
    ).rejects.toMatchObject({
      code: 'order.invalid_transition',
      message: 'This order was already cancelled.',
    });
    const preparing = await services.orders.get(MASALA_JUNCTION_ID, PREPARING);
    await expect(
      services.orders.reject(MASALA_JUNCTION_ID, PREPARING, {
        reason: 'too_busy',
        expectedVersion: preparing.version,
      }),
    ).rejects.toMatchObject({ code: 'order.invalid_transition' });
  });

  it('requires a known reason', async () => {
    const services = await demo();
    await expect(
      services.orders.reject(MASALA_JUNCTION_ID, NEW_ORDER, {
        // @ts-expect-error -- an unknown reason code, as a buggy client might send
        reason: 'bored',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('mock order service — mark ready', () => {
  it('moves preparing → ready_for_pickup', async () => {
    const services = await demo();
    const before = await services.orders.get(MASALA_JUNCTION_ID, PREPARING);
    const order = await services.orders.markReady(MASALA_JUNCTION_ID, PREPARING, {
      expectedVersion: before.version,
    });
    expect(order).toMatchObject({ status: 'ready_for_pickup', readyAt: NOW.toISOString() });
    expect(order.version).toBe(before.version + 1);
  });

  it('cannot mark a new or already-ready order ready', async () => {
    const services = await demo();
    await expect(
      services.orders.markReady(MASALA_JUNCTION_ID, NEW_ORDER, { expectedVersion: 1 }),
    ).rejects.toMatchObject({
      code: 'order.invalid_transition',
      message: 'Accept this order before marking it ready.',
    });
    const ready = await services.orders.get(MASALA_JUNCTION_ID, READY);
    await expect(
      services.orders.markReady(MASALA_JUNCTION_ID, READY, { expectedVersion: ready.version }),
    ).rejects.toMatchObject({ code: 'order.invalid_transition' });
  });

  it('runs the whole kitchen flow: accept → mark ready', async () => {
    const services = await demo();
    const accepted = await services.orders.accept(MASALA_JUNCTION_ID, NEW_ORDER, {
      prepMinutes: 15,
      expectedVersion: 1,
    });
    const ready = await services.orders.markReady(MASALA_JUNCTION_ID, NEW_ORDER, {
      expectedVersion: accepted.version,
    });
    expect(ready.timeline.map((e) => e.toStatus)).toEqual([
      'placed',
      'preparing',
      'ready_for_pickup',
    ]);
  });
});
