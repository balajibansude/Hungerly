import { ServiceError } from '@hungerly/app-core';

import { clearLocalSession } from '@/features/auth/clearLocalSession';
import { useSessionStore } from '@/features/auth/session';
import { MASALA_JUNCTION_ID } from '@/mock';
import type { OrderService, Services } from '@/services';
import { createMockServices, DEMO_PHONE_E164, PROTOTYPE_OTP } from '@/services/mock';

import { groupOrders } from './board';
import { fetchOrder, loadOrders, performOrderAction } from './operations';
import { useOrdersStore } from './store';

const NOW = new Date('2026-10-02T13:00:00+05:30');
const NEW_ORDER = 'ord-4k7p2m';
const PREPARING = 'ord-7r1c9w';

const store = () => useOrdersStore.getState();

async function demo(latencyMs = 0): Promise<Services> {
  const services = createMockServices({ latencyMs, now: () => NOW });
  const challenge = await services.auth.requestOtp({
    channel: 'phone',
    phoneE164: DEMO_PHONE_E164,
  });
  useSessionStore
    .getState()
    .signIn(await services.auth.verifyOtp(challenge.requestId, PROTOTYPE_OTP));
  return services;
}

beforeEach(() => {
  store().reset();
  useSessionStore.getState().signOut();
});

describe('loading the board', () => {
  it('fills the shared cache', async () => {
    const services = await demo();
    await loadOrders(services.orders, MASALA_JUNCTION_ID);
    expect(store().load).toEqual({ status: 'ready' });
    expect(Object.keys(store().byId)).toHaveLength(11);
  });

  it('reports a failed first load, but keeps orders on a failed refresh', async () => {
    const services = await demo();
    const failing: OrderService = {
      ...services.orders,
      list: () => Promise.reject(new ServiceError('network', 'You’re offline.')),
    };
    await loadOrders(failing, MASALA_JUNCTION_ID);
    expect(store().load).toEqual({ status: 'error', message: 'You’re offline.' });

    await loadOrders(services.orders, MASALA_JUNCTION_ID);
    await loadOrders(failing, MASALA_JUNCTION_ID, 'refresh');
    expect(store().load).toEqual({ status: 'ready' });
    expect(store().refreshing).toBe(false);
    expect(Object.keys(store().byId)).toHaveLength(11);
  });
});

describe('order actions', () => {
  it('accepts an order and updates the board and the detail together', async () => {
    const services = await demo();
    await loadOrders(services.orders, MASALA_JUNCTION_ID);

    const outcome = await performOrderAction(services.orders, MASALA_JUNCTION_ID, NEW_ORDER, {
      action: 'accept',
      prepMinutes: 20,
    });

    expect(outcome.ok).toBe(true);
    expect(store().byId[NEW_ORDER]?.status).toBe('preparing');
    const groups = groupOrders(Object.values(store().byId));
    expect(groups.new.map((o) => o.id)).not.toContain(NEW_ORDER);
    expect(groups.preparing.map((o) => o.id)).toContain(NEW_ORDER);
    expect(store().pending).toEqual({});
  });

  it('rejects and marks ready through the same path', async () => {
    const services = await demo();
    await loadOrders(services.orders, MASALA_JUNCTION_ID);
    await performOrderAction(services.orders, MASALA_JUNCTION_ID, NEW_ORDER, {
      action: 'reject',
      reason: 'too_busy',
    });
    await performOrderAction(services.orders, MASALA_JUNCTION_ID, PREPARING, {
      action: 'markReady',
    });
    expect(store().byId[NEW_ORDER]).toMatchObject({
      status: 'cancelled',
      cancelReason: 'too_busy',
    });
    expect(store().byId[PREPARING]?.status).toBe('ready_for_pickup');
  });

  it('ignores a second tap while the first action is running', async () => {
    const services = await demo(10);
    await loadOrders(services.orders, MASALA_JUNCTION_ID);
    const spy = jest.spyOn(services.orders, 'accept');

    const [first, second] = await Promise.all([
      performOrderAction(services.orders, MASALA_JUNCTION_ID, NEW_ORDER, {
        action: 'accept',
        prepMinutes: 20,
      }),
      performOrderAction(services.orders, MASALA_JUNCTION_ID, NEW_ORDER, {
        action: 'accept',
        prepMinutes: 20,
      }),
    ]);

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, reason: 'busy' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('refreshes a stale order and reports what happened', async () => {
    const services = await demo();
    await loadOrders(services.orders, MASALA_JUNCTION_ID);
    // Someone else accepts the order first (another device): our copy is now stale.
    await services.orders.accept(MASALA_JUNCTION_ID, NEW_ORDER, {
      prepMinutes: 30,
      expectedVersion: 1,
    });

    const outcome = await performOrderAction(services.orders, MASALA_JUNCTION_ID, NEW_ORDER, {
      action: 'reject',
      reason: 'too_busy',
    });

    expect(outcome).toEqual({
      ok: false,
      reason: 'failed',
      message: 'This order was already accepted.',
    });
    expect(store().byId[NEW_ORDER]).toMatchObject({ status: 'preparing', prepMinutes: 30 });
  });

  it('keeps the order unchanged when the service fails', async () => {
    const services = await demo();
    await loadOrders(services.orders, MASALA_JUNCTION_ID);
    const failing: OrderService = {
      ...services.orders,
      accept: () => Promise.reject(new ServiceError('network', 'You’re offline.')),
    };

    const outcome = await performOrderAction(failing, MASALA_JUNCTION_ID, NEW_ORDER, {
      action: 'accept',
      prepMinutes: 20,
    });

    expect(outcome).toEqual({ ok: false, reason: 'failed', message: 'You’re offline.' });
    expect(store().byId[NEW_ORDER]?.status).toBe('placed');
    expect(store().pending).toEqual({});
  });

  it('surfaces an invalid prep time from the service', async () => {
    const services = await demo();
    await loadOrders(services.orders, MASALA_JUNCTION_ID);
    const outcome = await performOrderAction(services.orders, MASALA_JUNCTION_ID, NEW_ORDER, {
      action: 'accept',
      prepMinutes: 120,
    });
    expect(outcome).toEqual({
      ok: false,
      reason: 'failed',
      message: 'Choose a preparation time between 5 and 90 minutes.',
    });
  });
});

describe('cache lifecycle', () => {
  it('fetches a single order opened directly', async () => {
    const services = await demo();
    useOrdersStore.getState().startLoading(MASALA_JUNCTION_ID, 'initial');
    await fetchOrder(services.orders, MASALA_JUNCTION_ID, PREPARING);
    expect(store().byId[PREPARING]?.orderNumber).toBe('HGR-7R1C9W');
  });

  it('is cleared on log out', async () => {
    const services = await demo();
    await loadOrders(services.orders, MASALA_JUNCTION_ID);
    clearLocalSession();
    expect(store().byId).toEqual({});
    expect(store().restaurantId).toBeNull();
    expect(store().load).toEqual({ status: 'idle' });
  });
});
