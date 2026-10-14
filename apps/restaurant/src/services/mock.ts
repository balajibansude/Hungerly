import { ApiError } from '@hungerly/api-client';
import type { Order, SignInResponse } from '@hungerly/api-client';

import { MASALA_JUNCTION_ID, masalaJunctionOrders } from '@/mock';

import type { Services } from '.';

export const DEMO_PHONE_E164 = '+919876543210';
export const PROTOTYPE_OTP = '123456';

interface MockServicesOptions {
  latencyMs?: number;
  now?: () => Date;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEMO_SESSION: SignInResponse = {
  tokens: { accessToken: 'demo-access', refreshToken: 'demo-refresh', accessExpiresInSeconds: 3600 },
  session: {
    user: { id: 'user-demo', fullName: 'Demo Owner', phoneE164: DEMO_PHONE_E164, email: null },
    business: {
      id: 'biz-demo',
      displayName: 'Masala Junction',
      legalName: 'Masala Junction Foods Pvt Ltd',
      entityType: 'company',
      gstin: null,
    },
    branches: [
      {
        id: MASALA_JUNCTION_ID,
        name: 'Masala Junction - Main Branch',
        locality: 'Koregaon Park',
        city: 'Pune',
        status: 'active',
        role: 'owner',
      },
    ],
  },
};

export function createMockServices(options: MockServicesOptions = {}): Services {
  const { latencyMs = 0, now = () => new Date() } = options;

  /** Mutable in-memory order store, seeded once. */
  const orderStore: Map<string, Order> = new Map();
  const seed = () => {
    if (orderStore.size === 0) {
      for (const order of masalaJunctionOrders(now())) {
        orderStore.set(order.id, order);
      }
    }
  };

  const wait = () => (latencyMs > 0 ? delay(latencyMs) : Promise.resolve());

  const orders = {
    async list(branchId: string, _query: object) {
      await wait();
      if (branchId !== MASALA_JUNCTION_ID) throw new ApiError(404, 'not_found', 'Branch not found.');
      seed();
      return { items: Array.from(orderStore.values()), nextCursor: null };
    },

    async get(branchId: string, orderId: string) {
      await wait();
      if (branchId !== MASALA_JUNCTION_ID) throw new ApiError(404, 'not_found', 'Branch not found.');
      seed();
      const order = orderStore.get(orderId);
      if (!order) throw new ApiError(404, 'not_found', 'Order not found.');
      return order;
    },

    async accept(branchId: string, orderId: string, input: { prepMinutes: number; expectedVersion: number }) {
      await wait();
      if (branchId !== MASALA_JUNCTION_ID) throw new ApiError(404, 'not_found', 'Branch not found.');
      if (input.prepMinutes < 5 || input.prepMinutes > 90) {
        throw new ApiError(422, 'validation', 'Choose a preparation time between 5 and 90 minutes.');
      }
      seed();
      const order = orderStore.get(orderId);
      if (!order) throw new ApiError(404, 'not_found', 'Order not found.');
      if (order.version !== input.expectedVersion) {
        throw new ApiError(409, 'order.version_conflict', 'This order was already accepted.');
      }
      if (order.status !== 'placed') {
        throw new ApiError(422, 'order.invalid_transition', 'This order was already accepted.');
      }
      const updated: Order = {
        ...order,
        status: 'preparing',
        prepMinutes: input.prepMinutes,
        acceptedAt: now().toISOString(),
        version: order.version + 1,
        timeline: [
          ...order.timeline,
          { status: 'preparing', at: now().toISOString(), actor: 'restaurant', note: null },
        ],
      };
      orderStore.set(orderId, updated);
      return updated;
    },

    async reject(branchId: string, orderId: string, input: { reason: string; expectedVersion: number }) {
      await wait();
      if (branchId !== MASALA_JUNCTION_ID) throw new ApiError(404, 'not_found', 'Branch not found.');
      seed();
      const order = orderStore.get(orderId);
      if (!order) throw new ApiError(404, 'not_found', 'Order not found.');
      if (order.version !== input.expectedVersion) {
        throw new ApiError(409, 'order.version_conflict', 'This order was already accepted.');
      }
      if (order.status !== 'placed') {
        throw new ApiError(422, 'order.invalid_transition', 'This order cannot be rejected.');
      }
      const updated: Order = {
        ...order,
        status: 'cancelled',
        cancelledBy: 'restaurant',
        cancelReason: input.reason,
        cancelledAt: now().toISOString(),
        version: order.version + 1,
        timeline: [
          ...order.timeline,
          { status: 'cancelled', at: now().toISOString(), actor: 'restaurant', note: null },
        ],
      };
      orderStore.set(orderId, updated);
      return updated;
    },

    async markReady(branchId: string, orderId: string, input: { expectedVersion: number }) {
      await wait();
      if (branchId !== MASALA_JUNCTION_ID) throw new ApiError(404, 'not_found', 'Branch not found.');
      seed();
      const order = orderStore.get(orderId);
      if (!order) throw new ApiError(404, 'not_found', 'Order not found.');
      if (order.version !== input.expectedVersion) {
        throw new ApiError(409, 'order.version_conflict', 'This order has changed.');
      }
      if (order.status !== 'preparing') {
        throw new ApiError(422, 'order.invalid_transition', 'This order cannot be marked ready.');
      }
      const updated: Order = {
        ...order,
        status: 'ready_for_pickup',
        readyAt: now().toISOString(),
        version: order.version + 1,
        timeline: [
          ...order.timeline,
          { status: 'ready_for_pickup', at: now().toISOString(), actor: 'restaurant', note: null },
        ],
      };
      orderStore.set(orderId, updated);
      return updated;
    },
  };

  const auth: Services['auth'] = {
    async requestOtp(_input) {
      await wait();
      return { requestId: 'req-demo-001' };
    },
    async verifyOtp(requestId, otp) {
      await wait();
      if (requestId !== 'req-demo-001' || otp !== PROTOTYPE_OTP) {
        throw new ApiError(401, 'auth.otp_invalid', 'Invalid or expired OTP.');
      }
      return DEMO_SESSION;
    },
  };

  return { orders, auth };
}
