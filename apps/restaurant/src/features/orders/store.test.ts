/**
 * Regression tests for the Zustand orders store and the getSnapshot stability issue.
 *
 * Root cause (fixed in useOrderBoard.ts):
 *   useOrdersStore((s) => Object.values(s.byId)) returned a NEW array reference on
 *   every call to the selector, even when the store state had not changed.
 *   React 18's useSyncExternalStore calls getSnapshot multiple times in concurrent mode
 *   to verify stability; an unstable result throws:
 *     "The result of getSnapshot should be cached to avoid an infinite loop"
 *   which then cascades into "Maximum update depth exceeded."
 *
 * Fix: wrap the selector with useShallow (zustand/shallow) so the previous array is
 * returned when all elements are reference-equal to the previous render's result.
 */

import { z } from 'zod';

import { masalaJunctionOrders, MASALA_JUNCTION_ID } from '@/mock';
import { createMockServices, DEMO_PHONE_E164, PROTOTYPE_OTP } from '@/services/mock';

import { useOrdersStore } from './store';

const store = () => useOrdersStore.getState();

beforeEach(() => {
  store().reset();
});

// ---------------------------------------------------------------------------
// getSnapshot stability — the root cause
// ---------------------------------------------------------------------------

describe('Object.values(byId) instability (documents the root cause)', () => {
  it('returns different array references for the same state — this is why useShallow is required', () => {
    const orders = masalaJunctionOrders();
    store().setOrders(orders, MASALA_JUNCTION_ID);

    const state = useOrdersStore.getState();

    // Simulate what React does: call the selector twice for the same state.
    const snapshot1 = Object.values(state.byId);
    const snapshot2 = Object.values(state.byId);

    // Always different references — this is the instability React detects.
    expect(snapshot1).not.toBe(snapshot2);
    // Contents are equivalent, so useShallow's shallow-compare will catch this
    // and return the first reference, making the snapshot stable.
    expect(snapshot1).toEqual(snapshot2);
  });

  it('byId itself is a stable reference between setOrders calls', () => {
    const orders = masalaJunctionOrders();
    store().setOrders(orders, MASALA_JUNCTION_ID);

    const ref1 = useOrdersStore.getState().byId;
    const ref2 = useOrdersStore.getState().byId;

    // Zustand returns the same object reference for unmodified slices.
    expect(ref1).toBe(ref2);
  });
});

// ---------------------------------------------------------------------------
// Store load lifecycle
// ---------------------------------------------------------------------------

describe('load lifecycle', () => {
  it('transitions idle → loading → ready', () => {
    expect(store().load.status).toBe('idle');

    store().startLoading(MASALA_JUNCTION_ID, 'initial');
    expect(store().load.status).toBe('loading');

    const orders = masalaJunctionOrders();
    store().setOrders(orders, MASALA_JUNCTION_ID);
    expect(store().load.status).toBe('ready');
    expect(Object.keys(store().byId)).toHaveLength(orders.length);
  });

  it('preserves data and status=ready when a refresh fails', () => {
    const orders = masalaJunctionOrders();
    store().setOrders(orders, MASALA_JUNCTION_ID);

    store().startLoading(MASALA_JUNCTION_ID, 'refresh');
    store().setLoadError('Network error');

    // Refresh failure while data is loaded must not clear orders.
    expect(store().load.status).toBe('ready');
    expect(Object.keys(store().byId)).toHaveLength(orders.length);
  });

  it('shows error when the initial load fails', () => {
    store().startLoading(MASALA_JUNCTION_ID, 'initial');
    store().setLoadError('Cannot reach server.');

    expect(store().load).toEqual({ status: 'error', message: 'Cannot reach server.' });
  });

  it('resets to idle on logout', () => {
    store().setOrders(masalaJunctionOrders(), MASALA_JUNCTION_ID);
    store().reset();
    expect(store().load.status).toBe('idle');
    expect(store().byId).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Derived order updates
// ---------------------------------------------------------------------------

describe('setOrder', () => {
  it('replaces one order in byId without touching others', () => {
    const orders = masalaJunctionOrders();
    store().setOrders(orders, MASALA_JUNCTION_ID);

    const target = orders[0]!;
    const updated = { ...target, status: 'preparing' as const, version: target.version + 1 };
    store().setOrder(updated);

    expect(store().byId[target.id]).toMatchObject({ status: 'preparing', version: 2 });
    expect(Object.keys(store().byId)).toHaveLength(orders.length);
  });
});

// ---------------------------------------------------------------------------
// Regression: services/mock DEMO_SESSION uses valid UUIDs
// ---------------------------------------------------------------------------

describe('createMockServices UUID validity', () => {
  it('requestOtp returns a UUID that z.uuid() accepts', async () => {
    const { auth } = createMockServices();
    const { requestId } = await auth.requestOtp({ channel: 'phone', phoneE164: DEMO_PHONE_E164 });
    expect(z.uuid().safeParse(requestId).success).toBe(true);
  });

  it('verifyOtp session user and business IDs are valid UUIDs', async () => {
    const { auth } = createMockServices();
    const { requestId } = await auth.requestOtp({ channel: 'phone', phoneE164: DEMO_PHONE_E164 });
    const response = await auth.verifyOtp(requestId, PROTOTYPE_OTP);
    expect(z.uuid().safeParse(response.session.user.id).success).toBe(true);
    expect(z.uuid().safeParse(response.session.business!.id).success).toBe(true);
    expect(z.uuid().safeParse(response.session.branches[0]!.id).success).toBe(true);
  });

  it('rejects an unknown requestId', async () => {
    const { auth } = createMockServices();
    await expect(
      auth.verifyOtp('00000000-0000-4000-8000-000000000099', PROTOTYPE_OTP),
    ).rejects.toMatchObject({ code: 'auth.otp_invalid' });
  });

  it('rejects a wrong OTP', async () => {
    const { auth } = createMockServices();
    const { requestId } = await auth.requestOtp({ channel: 'phone', phoneE164: DEMO_PHONE_E164 });
    await expect(auth.verifyOtp(requestId, '000000')).rejects.toMatchObject({
      code: 'auth.otp_invalid',
    });
  });
});
