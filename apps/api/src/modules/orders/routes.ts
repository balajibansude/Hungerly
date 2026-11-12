import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  AcceptOrderSchema,
  MarkReadySchema,
  OrderListQuerySchema,
  OrderPageSchema,
  OrderSchema,
  paths,
  RejectOrderSchema,
} from '@hungerly/api-client';

import { requireOwnedBranch } from '../../auth/guard';
import { audit } from '../../lib/audit';
import { decodeCursor, encodeCursor } from '../../lib/pagination';
import {
  acceptOrder,
  expireOverdueOrders,
  listOrders,
  markReady,
  rejectOrder,
  requireBranchOrder,
  toOrderDtos,
} from './service';

const BranchParams = z.object({ branchId: z.uuid() });
const OrderParams = BranchParams.extend({ orderId: z.uuid() });

/** Restaurant order handling. Delivery and payment moves are not partner actions. */
export async function orderRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();
  const { deps } = app;

  app.get(
    paths.partner.orders(':branchId'),
    {
      schema: {
        params: BranchParams,
        querystring: OrderListQuerySchema,
        response: { 200: OrderPageSchema },
      },
    },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      await expireOverdueOrders(deps.db, branch.id, deps.clock());
      const cursor = decodeCursor<{ p: string; i: string }>(req.query.cursor);
      if (
        cursor &&
        (typeof cursor.p !== 'string' ||
          typeof cursor.i !== 'string' ||
          Number.isNaN(Date.parse(cursor.p)))
      ) {
        return { items: [], nextCursor: null };
      }
      const { rows, next } = await listOrders(deps.db, branch.id, {
        status: req.query.status,
        cursor,
        limit: req.query.limit,
      });
      return {
        items: await toOrderDtos(deps.db, rows),
        nextCursor: next ? encodeCursor(next) : null,
      };
    },
  );

  app.get(
    paths.partner.order(':branchId', ':orderId'),
    { schema: { params: OrderParams, response: { 200: OrderSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      await expireOverdueOrders(deps.db, branch.id, deps.clock());
      const order = await requireBranchOrder(deps.db, branch.id, req.params.orderId);
      return (await toOrderDtos(deps.db, [order]))[0]!;
    },
  );

  app.post(
    paths.partner.orderAccept(':branchId', ':orderId'),
    { schema: { params: OrderParams, body: AcceptOrderSchema, response: { 200: OrderSchema } } },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const order = await acceptOrder(deps.db, deps, branch.id, req.params.orderId, {
        ...req.body,
        actorUserId: auth.userId,
      });
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'order.accepted',
        entityType: 'order',
        entityId: order.id,
        branchId: branch.id,
        metadata: { prepMinutes: req.body.prepMinutes },
        ip: req.ip,
      });
      return (await toOrderDtos(deps.db, [order]))[0]!;
    },
  );

  app.post(
    paths.partner.orderReject(':branchId', ':orderId'),
    { schema: { params: OrderParams, body: RejectOrderSchema, response: { 200: OrderSchema } } },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const order = await rejectOrder(deps.db, deps, branch.id, req.params.orderId, {
        ...req.body,
        actorUserId: auth.userId,
      });
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'order.rejected',
        entityType: 'order',
        entityId: order.id,
        branchId: branch.id,
        metadata: { reason: req.body.reason },
        ip: req.ip,
      });
      return (await toOrderDtos(deps.db, [order]))[0]!;
    },
  );

  app.post(
    paths.partner.orderReady(':branchId', ':orderId'),
    { schema: { params: OrderParams, body: MarkReadySchema, response: { 200: OrderSchema } } },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const order = await markReady(deps.db, deps, branch.id, req.params.orderId, {
        ...req.body,
        actorUserId: auth.userId,
      });
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'order.ready',
        entityType: 'order',
        entityId: order.id,
        branchId: branch.id,
        ip: req.ip,
      });
      return (await toOrderDtos(deps.db, [order]))[0]!;
    },
  );
}
