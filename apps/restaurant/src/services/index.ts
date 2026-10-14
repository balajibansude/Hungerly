import { ordersApi } from '@/features/orders/api';

export type OrderService = typeof ordersApi;

export interface AuthService {
  requestOtp: (input: { channel: 'phone' | 'email'; phoneE164?: string; email?: string }) => Promise<{ requestId: string }>;
  verifyOtp: (requestId: string, otp: string) => Promise<import('@hungerly/api-client').SignInResponse>;
}

export interface Services {
  orders: OrderService;
  auth: AuthService;
}

const _services: Pick<Services, 'orders'> = { orders: ordersApi };

export function useServices(): Pick<Services, 'orders'> {
  return _services;
}
