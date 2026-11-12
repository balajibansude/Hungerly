import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { DashboardQuerySchema, DashboardSchema, paths } from '@hungerly/api-client';

import { requireOwnedBranch } from '../../auth/guard';
import { expireOverdueOrders } from '../orders/service';
import { buildDashboard } from './service';

const BranchParams = z.object({ branchId: z.uuid() });

/** Owner dashboard for one branch. Every figure is computed from stored orders. */
export async function dashboardRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();
  const { deps } = app;

  app.get(
    paths.partner.dashboard(':branchId'),
    {
      schema: {
        params: BranchParams,
        querystring: DashboardQuerySchema,
        response: { 200: DashboardSchema },
      },
    },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      const now = deps.clock();
      await expireOverdueOrders(deps.db, branch.id, now);
      return buildDashboard(deps.db, branch, now, req.query.date);
    },
  );
}
