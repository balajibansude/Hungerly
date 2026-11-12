import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  AdminPayoutAccountPageSchema,
  LedgerAdjustmentSchema,
  LedgerEntrySchema,
  PayoutAccountSchema,
  PayoutAccountStatusSchema,
  paths,
  RejectWithReasonSchema,
  VerifyPayoutAccountSchema,
} from '@hungerly/api-client';

import { requireAdmin } from '../../auth/guard';
import { branches, documents, ledgerEntries, orders, payoutAccounts } from '../../db/schema';
import { audit } from '../../lib/audit';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import { inr } from '../../lib/money';
import { toAccountDto } from '../payouts/accounts';
import { reconcilePayouts } from '../payouts/service';

const AccountParams = z.object({ accountId: z.uuid() });
const BranchParams = z.object({ branchId: z.uuid() });
const AccountQuery = z.object({ status: PayoutAccountStatusSchema.default('pending_verification') });
const ReconcileResultSchema = z.object({ checked: z.number().int(), updated: z.number().int(), errors: z.number().int() });

/**
 * Finance administration: bank account verification (out-of-band review against the
 * branch's approved bank proof), manual ledger adjustments and payout reconciliation.
 * Every action is audited with the acting administrator.
 */
export async function adminFinanceRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();

  app.get(
    paths.admin.payoutAccounts,
    { schema: { querystring: AccountQuery, response: { 200: AdminPayoutAccountPageSchema } } },
    async (req) => {
      await requireAdmin(req, ['finance']);
      const rows = await app.deps.db
        .select({ account: payoutAccounts, branchName: branches.name })
        .from(payoutAccounts)
        .innerJoin(branches, eq(branches.id, payoutAccounts.branchId))
        .where(and(eq(payoutAccounts.status, req.query.status), eq(payoutAccounts.isCurrent, true)))
        .orderBy(payoutAccounts.createdAt)
        .limit(100);
      return { items: rows.map((r) => ({ ...toAccountDto(r.account), branchName: r.branchName })), nextCursor: null };
    },
  );

  app.post(
    paths.admin.payoutAccountVerify(':accountId'),
    { schema: { params: AccountParams, body: VerifyPayoutAccountSchema, response: { 200: PayoutAccountSchema } } },
    async (req) => {
      const admin = await requireAdmin(req, ['finance']);
      const { db, clock } = app.deps;
      const [account] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.id, req.params.accountId)).limit(1);
      if (!account) throw notFound('Payout account not found.');
      if (!account.isCurrent || (account.status !== 'pending_verification' && account.status !== 'verification_in_progress')) {
        throw conflict('conflict', 'Only the current, unverified account can be verified.');
      }
      const [proof] = await db
        .select({ id: documents.id })
        .from(documents)
        .where(and(eq(documents.branchId, account.branchId), eq(documents.type, 'bank_proof'), eq(documents.status, 'approved')))
        .limit(1);
      if (!proof) {
        throw unprocessable('payout.account_unverified', 'Approve the branch bank proof document before verifying the account.');
      }
      const now = clock();
      const [updated] = await db
        .update(payoutAccounts)
        .set({ status: 'verified', verifiedAt: now, verifiedVia: 'finance_review', verifiedBy: admin.userId, failureReason: null, updatedAt: now })
        .where(eq(payoutAccounts.id, account.id))
        .returning();
      await audit(db, {
        actorUserId: admin.userId,
        actorType: 'admin',
        action: 'payout_account.verified',
        entityType: 'payout_account',
        entityId: account.id,
        branchId: account.branchId,
        metadata: { last4: account.accountLast4, via: 'finance_review', bankProofDocumentId: proof.id, note: req.body.note },
        ip: req.ip,
      });
      return toAccountDto(updated!);
    },
  );

  app.post(
    paths.admin.payoutAccountReject(':accountId'),
    { schema: { params: AccountParams, body: RejectWithReasonSchema, response: { 200: PayoutAccountSchema } } },
    async (req) => {
      const admin = await requireAdmin(req, ['finance']);
      const { db, clock } = app.deps;
      const [account] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.id, req.params.accountId)).limit(1);
      if (!account) throw notFound('Payout account not found.');
      if (!account.isCurrent || account.status === 'disabled' || account.status === 'failed') {
        throw conflict('conflict', 'This account cannot be rejected.');
      }
      const now = clock();
      const [updated] = await db
        .update(payoutAccounts)
        .set({ status: 'failed', verifiedAt: null, verifiedVia: null, failureReason: req.body.reason, updatedAt: now })
        .where(eq(payoutAccounts.id, account.id))
        .returning();
      await audit(db, {
        actorUserId: admin.userId,
        actorType: 'admin',
        action: 'payout_account.rejected',
        entityType: 'payout_account',
        entityId: account.id,
        branchId: account.branchId,
        metadata: { last4: account.accountLast4, reason: req.body.reason },
        ip: req.ip,
      });
      return toAccountDto(updated!);
    },
  );

  app.post(
    paths.admin.branchLedgerAdjustments(':branchId'),
    { schema: { params: BranchParams, body: LedgerAdjustmentSchema, response: { 200: LedgerEntrySchema } } },
    async (req) => {
      const admin = await requireAdmin(req, ['finance']);
      const { db, clock } = app.deps;
      const { amountMinor, kind, reason, orderId } = req.body;
      const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, req.params.branchId)).limit(1);
      if (!branch) throw notFound('Branch not found.');
      let orderNumber: string | null = null;
      if (orderId) {
        const [order] = await db
          .select({ orderNumber: orders.orderNumber })
          .from(orders)
          .where(and(eq(orders.id, orderId), eq(orders.branchId, branch.id)))
          .limit(1);
        if (!order) throw notFound('Order not found for this branch.');
        orderNumber = order.orderNumber;
      }
      if (kind === 'refund_deduction' && amountMinor > 0) {
        throw unprocessable('validation', 'A refund deduction must be negative.', { amountMinor: ['Must be negative'] });
      }
      const now = clock();
      const [entry] = await db
        .insert(ledgerEntries)
        .values({
          branchId: branch.id,
          type: kind,
          amountMinor,
          description: reason,
          orderId,
          availableAt: now,
          createdBy: admin.userId,
          createdAt: now,
        })
        .returning();
      await audit(db, {
        actorUserId: admin.userId,
        actorType: 'admin',
        action: `ledger.${kind}`,
        entityType: 'ledger_entry',
        entityId: entry!.id,
        branchId: branch.id,
        metadata: { amountMinor, reason, orderId },
        ip: req.ip,
      });
      return {
        id: entry!.id,
        type: entry!.type,
        amount: inr(entry!.amountMinor),
        description: entry!.description,
        orderId: entry!.orderId,
        orderNumber,
        payoutId: null,
        availableAt: entry!.availableAt.toISOString(),
        createdAt: entry!.createdAt.toISOString(),
      };
    },
  );

  app.post(paths.admin.payoutsReconcile, { schema: { response: { 200: ReconcileResultSchema } } }, async (req) => {
    const admin = await requireAdmin(req, ['finance', 'operations']);
    const result = await reconcilePayouts(app.deps);
    await audit(app.deps.db, {
      actorUserId: admin.userId,
      actorType: 'admin',
      action: 'payouts.reconciled',
      entityType: 'payout',
      metadata: result,
      ip: req.ip,
    });
    return result;
  });

}
