import { and, asc, desc, eq, gte, lt, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  LedgerPageSchema,
  PageQuerySchema,
  paths,
  WalletSchema,
  WalletSummaryQuerySchema,
  WalletSummarySchema,
} from '@hungerly/api-client';

import { requireOwnedBranch } from '../../auth/guard';
import { ledgerEntries, orders } from '../../db/schema';
import { decodeCursor, encodeCursor } from '../../lib/pagination';
import { inr } from '../../lib/money';
import { addDays, istMidnight } from '../../lib/time';
import { csvField, getSummary, getWallet, istTimestamp, ledgerTypeLabel, rupees, validateRange } from './service';

const BranchParams = z.object({ branchId: z.uuid() });

/**
 * Wallet (read-only for the owner). There is no endpoint that writes balances: they are
 * sums of server-written ledger rows (see ledger.ts). Withdrawals are in payouts/routes.ts.
 */
export async function walletRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();

  app.get(
    paths.partner.wallet(':branchId'),
    { schema: { params: BranchParams, response: { 200: WalletSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      return getWallet(app.deps, branch);
    },
  );

  app.get(
    paths.partner.walletSummary(':branchId'),
    { schema: { params: BranchParams, querystring: WalletSummaryQuerySchema, response: { 200: WalletSummarySchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      return getSummary(app.deps, branch, req.query.from, req.query.to);
    },
  );

  app.get(
    paths.partner.walletTransactions(':branchId'),
    { schema: { params: BranchParams, querystring: PageQuerySchema, response: { 200: LedgerPageSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      const cursor = decodeCursor<{ c: string; i: string }>(req.query.cursor);
      const rows = await app.deps.db
        .select({ entry: ledgerEntries, orderNumber: orders.orderNumber })
        .from(ledgerEntries)
        .leftJoin(orders, eq(orders.id, ledgerEntries.orderId))
        .where(
          and(
            eq(ledgerEntries.branchId, branch.id),
            cursor
              ? or(
                  lt(ledgerEntries.createdAt, new Date(cursor.c)),
                  and(eq(ledgerEntries.createdAt, new Date(cursor.c)), lt(ledgerEntries.id, cursor.i)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(ledgerEntries.createdAt), desc(ledgerEntries.id))
        .limit(req.query.limit + 1);
      const page = rows.slice(0, req.query.limit);
      const last = page.at(-1);
      return {
        items: page.map(({ entry, orderNumber }) => ({
          id: entry.id,
          type: entry.type,
          amount: inr(entry.amountMinor),
          description: entry.description,
          orderId: entry.orderId,
          orderNumber: orderNumber ?? null,
          payoutId: entry.payoutId,
          availableAt: entry.availableAt.toISOString(),
          createdAt: entry.createdAt.toISOString(),
        })),
        nextCursor:
          rows.length > req.query.limit && last
            ? encodeCursor({ c: last.entry.createdAt.toISOString(), i: last.entry.id })
            : null,
      };
    },
  );

  /** CSV statement (masked data only), India time, amounts in rupees. */
  app.get(
    paths.partner.walletStatement(':branchId'),
    { schema: { params: BranchParams, querystring: WalletSummaryQuerySchema } },
    async (req, reply) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      const { from, to } = req.query;
      validateRange(from, to);
      const rows = await app.deps.db
        .select({ entry: ledgerEntries, orderNumber: orders.orderNumber })
        .from(ledgerEntries)
        .leftJoin(orders, eq(orders.id, ledgerEntries.orderId))
        .where(
          and(
            eq(ledgerEntries.branchId, branch.id),
            gte(ledgerEntries.createdAt, istMidnight(from)),
            lt(ledgerEntries.createdAt, istMidnight(addDays(to, 1))),
          ),
        )
        .orderBy(asc(ledgerEntries.createdAt), asc(ledgerEntries.id));
      const header = ['Date (IST)', 'Type', 'Description', 'Order', 'Amount (INR)', 'Available from (IST)'];
      const lines = [
        header.map(csvField).join(','),
        ...rows.map(({ entry, orderNumber }) =>
          [
            istTimestamp(entry.createdAt),
            ledgerTypeLabel(entry.type),
            entry.description,
            orderNumber ?? '',
            rupees(entry.amountMinor),
            istTimestamp(entry.availableAt),
          ]
            .map(csvField)
            .join(','),
        ),
      ];
      const fileName = `swaadone-statement-${from}-to-${to}.csv`;
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${fileName}"`)
        .header('Cache-Control', 'no-store')
        .send(`${lines.join('\r\n')}\r\n`);
    },
  );
}
