import type { FastifyInstance } from 'fastify';

import { adminFinanceRoutes } from './modules/admin/financeRoutes';
import { adminPricingRoutes } from './modules/admin/pricingRoutes';
import { adminReviewRoutes } from './modules/admin/reviewRoutes';
import { authRoutes } from './modules/auth/routes';
import { branchRoutes } from './modules/branches/routes';
import { catalogRoutes } from './modules/catalog/routes';
import { couponRoutes } from './modules/coupons/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { documentRoutes } from './modules/documents/routes';
import { menuRoutes } from './modules/menu/routes';
import { orderRoutes } from './modules/orders/routes';
import { payoutRoutes } from './modules/payouts/routes';
import { reviewRoutes } from './modules/reviews/routes';
import { walletRoutes } from './modules/wallet/routes';

/** Route registry: one routes file per module, all under `/api/v1`. */
export async function registerRoutes(api: FastifyInstance) {
  api.get('/health', async () => ({ ok: true }));
  await api.register(authRoutes);
  // Onboarding, branches, documents, declaration, admin licence/branch review
  await api.register(branchRoutes);
  await api.register(documentRoutes);
  await api.register(adminReviewRoutes);
  // Operations
  await api.register(menuRoutes);
  await api.register(orderRoutes);
  await api.register(dashboardRoutes);
  await api.register(reviewRoutes);
  // Money and offers
  await api.register(payoutRoutes);
  await api.register(walletRoutes);
  await api.register(couponRoutes);
  await api.register(adminFinanceRoutes);
  // Pricing configuration
  await api.register(adminPricingRoutes);
  // Public catalog endpoints (no auth)
  await api.register(catalogRoutes);
}
