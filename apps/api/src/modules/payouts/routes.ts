import { and, desc, eq, lt, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  PageQuerySchema,
  PayoutAccountResponseSchema,
  PayoutPageSchema,
  PayoutSchema,
  paths,
  RequestPayoutSchema,
  SetPayoutAccountSchema,
} from '@hungerly/api-client';

import { requireOwnedBranch } from '../../auth/guard';
import { payoutAccounts, payouts } from '../../db/schema';
import { badRequest, notFound } from '../../lib/errors';
import { decodeCursor, encodeCursor } from '../../lib/pagination';
import { accountResponse, refreshValidation, setPayoutAccount } from './accounts';
import { isUuid, payoutDto, requestPayout, toPayoutDto } from './service';
import { webhookRoutes } from './webhooks';

const BranchParams = z.object({ branchId: z.uuid() });
const PayoutParams = z.object({ branchId: z.uuid(), payoutId: z.uuid() });

export async function payoutRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();

  // --- Payout destination ----------------------------------------------------------

  app.get(
    paths.partner.payoutAccount(':branchId'),
    { schema: { params: BranchParams, response: { 200: PayoutAccountResponseSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      return accountResponse(app.deps, branch.id);
    },
  );

  app.post(
    paths.partner.payoutAccount(':branchId'),
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: BranchParams, body: SetPayoutAccountSchema, response: { 200: PayoutAccountResponseSchema } },
    },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      await setPayoutAccount(app.deps, { branch, userId: auth.userId, details: req.body, ip: req.ip });
      return accountResponse(app.deps, branch.id);
    },
  );

  app.post(
    paths.partner.payoutAccountRefresh(':branchId'),
    { schema: { params: BranchParams, response: { 200: PayoutAccountResponseSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      await refreshValidation(app.deps, branch);
      return accountResponse(app.deps, branch.id);
    },
  );

  // --- Withdrawals -----------------------------------------------------------------

  app.get(
    paths.partner.payouts(':branchId'),
    { schema: { params: BranchParams, querystring: PageQuerySchema, response: { 200: PayoutPageSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      const cursor = decodeCursor<{ c: string; i: string }>(req.query.cursor);
      const rows = await app.deps.db
        .select({ payout: payouts, last4: payoutAccounts.accountLast4 })
        .from(payouts)
        .innerJoin(payoutAccounts, eq(payoutAccounts.id, payouts.payoutAccountId))
        .where(
          and(
            eq(payouts.branchId, branch.id),
            cursor
              ? or(
                  lt(payouts.createdAt, new Date(cursor.c)),
                  and(eq(payouts.createdAt, new Date(cursor.c)), lt(payouts.id, cursor.i)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(payouts.createdAt), desc(payouts.id))
        .limit(req.query.limit + 1);
      const page = rows.slice(0, req.query.limit);
      const last = page.at(-1);
      return {
        items: page.map((r) => toPayoutDto(r.payout, r.last4)),
        nextCursor:
          rows.length > req.query.limit && last
            ? encodeCursor({ c: last.payout.createdAt.toISOString(), i: last.payout.id })
            : null,
      };
    },
  );

  app.get(
    paths.partner.payout(':branchId', ':payoutId'),
    { schema: { params: PayoutParams, response: { 200: PayoutSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      const [row] = await app.deps.db
        .select()
        .from(payouts)
        .where(and(eq(payouts.id, req.params.payoutId), eq(payouts.branchId, branch.id)))
        .limit(1);
      if (!row) throw notFound('Withdrawal not found.');
      return payoutDto(app.deps.db, row);
    },
  );

  /**
   * Requests a withdrawal. Requires an `Idempotency-Key` (UUID) header. The body carries
   * only the amount: status, balance and destination are decided by the server.
   */
  app.post(
    paths.partner.payouts(':branchId'),
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { params: BranchParams, body: RequestPayoutSchema, response: { 200: PayoutSchema } },
    },
    async (req) => {
      const key = req.headers['idempotency-key'];
      const idempotencyKey = Array.isArray(key) ? key[0] : key;
      if (!isUuid(idempotencyKey)) {
        throw badRequest('validation', 'Send a UUID Idempotency-Key header with every withdrawal request.', {
          'Idempotency-Key': ['Required (UUID)'],
        });
      }
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const payout = await requestPayout(app.deps, {
        branch,
        userId: auth.userId,
        amountMinor: req.body.amountMinor,
        idempotencyKey: idempotencyKey.toLowerCase(),
        ip: req.ip,
      });
      return payoutDto(app.deps.db, payout);
    },
  );

  await app.register(webhookRoutes);
}
