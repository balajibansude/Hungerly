import {
  OrderPageSchema,
  OrderSchema,
  paths,
  type Order,
  type OrderStatus,
} from '@hungerly/api-client';

import { api } from '@/lib/api';

import type { RejectReason } from './format';

/** Thin, typed wrappers over the order endpoints. Every call is scoped to a branch. */
export const ordersApi = {
  list(branchId: string, query: { status?: OrderStatus | 'active' | 'history'; cursor?: string; limit?: number }) {
    return api.request('GET', paths.partner.orders(branchId), { schema: OrderPageSchema, query });
  },
  get(branchId: string, orderId: string) {
    return api.request('GET', paths.partner.order(branchId, orderId), { schema: OrderSchema });
  },
  accept(branchId: string, orderId: string, input: { prepMinutes: number; expectedVersion: number }) {
    return api.request('POST', paths.partner.orderAccept(branchId, orderId), { schema: OrderSchema, body: input });
  },
  reject(branchId: string, orderId: string, input: { reason: RejectReason; expectedVersion: number }) {
    return api.request('POST', paths.partner.orderReject(branchId, orderId), { schema: OrderSchema, body: input });
  },
  markReady(branchId: string, orderId: string, input: { expectedVersion: number }) {
    return api.request('POST', paths.partner.orderReady(branchId, orderId), { schema: OrderSchema, body: input });
  },
};

export type OrdersApi = typeof ordersApi;
export type { Order };
