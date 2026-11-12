import { and, eq, inArray, lt, or } from 'drizzle-orm';

import type { Payout } from '@hungerly/api-client';

import type { AppDeps } from '../../app';
import type { BranchRow } from '../../auth/guard';
import type { Db } from '../../db/client';
import { branches, ledgerEntries, payoutAccounts, payouts } from '../../db/schema';
import { audit } from '../../lib/audit';
import { AppError, conflict, unavailable, unprocessable } from '../../lib/errors';
import { inr } from '../../lib/money';
import { computeBalances } from '../wallet/ledger';
import { ensureFundAccount } from './accounts';
import { ProviderRequestError, type ProviderPayout } from './provider';
import {
  canMovePayout,
  fromProviderStatus,
  REVERSING_PAYOUT_STATUSES,
  type PayoutStatus,
} from './status';

export type PayoutRow = typeof payouts.$inferSelect;

export function toPayoutDto(row: PayoutRow, destinationLast4: string): Payout {
  return {
    id: row.id,
    branchId: row.branchId,
    amount: inr(row.amountMinor),
    status: row.status,
    providerMode: row.providerMode,
    providerPayoutId: row.providerPayoutId,
    utr: row.utr,
    failureReason: row.failureReason,
    destinationLast4,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function payoutDto(db: Db, row: PayoutRow): Promise<Payout> {
  const [account] = await db
    .select({ last4: payoutAccounts.accountLast4 })
    .from(payoutAccounts)
    .where(eq(payoutAccounts.id, row.payoutAccountId))
    .limit(1);
  return toPayoutDto(row, account?.last4 ?? '----');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return !!value && UUID.test(value);
}

/**
 * Creates a withdrawal. Everything that decides *whether* money may leave happens here,
 * on the server, inside one transaction holding a lock on the branch row, so two requests
 * can never both spend the same balance. Retries with the same Idempotency-Key return the
 * original payout instead of creating another one.
 */
export async function requestPayout(
  deps: AppDeps,
  input: { branch: BranchRow; userId: string; amountMinor: number; idempotencyKey: string; ip: string | null },
): Promise<PayoutRow> {
  const { db, clock, config, payoutProvider } = deps;
  const { branch, amountMinor, idempotencyKey } = input;

  // A finance-verified account may still lack a provider fund account (verified while
  // the provider was unconfigured): create it now, outside the money transaction.
  if (payoutProvider.mode !== 'unconfigured') {
    const [current] = await db
      .select()
      .from(payoutAccounts)
      .where(and(eq(payoutAccounts.branchId, branch.id), eq(payoutAccounts.isCurrent, true)))
      .limit(1);
    if (current?.status === 'verified' && !current.providerFundAccountId) {
      await ensureFundAccount(deps, current, branch).catch(() => undefined);
    }
  }

  const outcome = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(branches).where(eq(branches.id, branch.id)).for('update');
    if (!locked) throw new AppError(404, 'not_found', 'Branch not found.');

    const [existing] = await tx
      .select()
      .from(payouts)
      .where(and(eq(payouts.branchId, branch.id), eq(payouts.idempotencyKey, idempotencyKey)))
      .limit(1);
    if (existing) {
      if (existing.amountMinor !== amountMinor) {
        throw conflict('idempotency_conflict', 'This request key was already used for a different amount.');
      }
      return { payout: existing, created: false };
    }

    if (payoutProvider.mode === 'unconfigured') {
      throw unavailable('payout.provider_unconfigured', 'Withdrawals are not available yet. Swaadone has not enabled payouts.');
    }
    if (locked.status !== 'active') {
      throw unprocessable('payout.not_eligible', 'Withdrawals are available once this branch is approved and active.');
    }
    const [account] = await tx
      .select()
      .from(payoutAccounts)
      .where(and(eq(payoutAccounts.branchId, branch.id), eq(payoutAccounts.isCurrent, true)))
      .limit(1);
    if (!account || account.status !== 'verified' || !account.providerFundAccountId) {
      throw unprocessable('payout.account_unverified', 'Add a bank account and wait for it to be verified before withdrawing.');
    }
    if (amountMinor < config.MIN_WITHDRAWAL_MINOR) {
      throw unprocessable(
        'payout.below_minimum',
        `The minimum withdrawal is ₹${(config.MIN_WITHDRAWAL_MINOR / 100).toFixed(2)}.`,
      );
    }
    const now = clock();
    const balances = await computeBalances(tx, branch.id, now);
    if (amountMinor > balances.available) {
      throw unprocessable('payout.insufficient_balance', 'The amount is more than your available balance.');
    }

    const [payout] = await tx
      .insert(payouts)
      .values({
        branchId: branch.id,
        payoutAccountId: account.id,
        amountMinor,
        status: 'requested',
        providerMode: payoutProvider.mode,
        idempotencyKey,
        requestedBy: input.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await tx.insert(ledgerEntries).values({
      branchId: branch.id,
      type: 'payout',
      amountMinor: -amountMinor,
      description: `Withdrawal to bank account ending ${account.accountLast4}`,
      payoutId: payout!.id,
      availableAt: now,
      createdBy: input.userId,
      createdAt: now,
    });
    await audit(tx, {
      actorUserId: input.userId,
      actorType: 'owner',
      action: 'payout.requested',
      entityType: 'payout',
      entityId: payout!.id,
      branchId: branch.id,
      metadata: { amountMinor, destinationLast4: account.accountLast4, providerMode: payoutProvider.mode },
      ip: input.ip,
    });
    return { payout: payout!, created: true };
  });

  if (!outcome.created) return outcome.payout;
  return submitToProvider(deps, outcome.payout.id);
}

/**
 * Sends a `requested` payout to the provider. Safe to repeat: the provider idempotency
 * key is our payout id, so a retry after a timeout never creates a second transfer.
 */
export async function submitToProvider(deps: AppDeps, payoutId: string): Promise<PayoutRow> {
  const { db, payoutProvider, clock } = deps;
  const [payout] = await db.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1);
  if (!payout) throw new Error(`Payout ${payoutId} not found`);
  if (payout.status !== 'requested') return payout;
  const [account] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.id, payout.payoutAccountId)).limit(1);
  if (!account?.providerFundAccountId) {
    return applyPayoutStatus(deps, payout.id, { status: 'failed', failureReason: 'The bank account is not registered with the payout provider.' });
  }

  try {
    const result = await payoutProvider.createPayout({
      fundAccountId: account.providerFundAccountId,
      amountMinor: payout.amountMinor,
      idempotencyKey: payout.id,
      referenceId: payout.id,
      narration: 'Swaadone payout',
    });
    return applyProviderPayout(deps, payout.id, result);
  } catch (error) {
    if (error instanceof ProviderRequestError && !error.retryable) {
      return applyPayoutStatus(deps, payout.id, {
        status: 'failed',
        failureReason: 'The payout provider declined this transfer. The amount is back in your wallet.',
        providerError: error.message,
      });
    }
    // Unconfigured, timeout, network, 5xx or an unexpected error: the transfer may or may
    // not exist at the provider. Keep it `requested` (money stays reserved);
    // reconciliation retries with the same idempotency key.
    const [updated] = await db
      .update(payouts)
      .set({ providerAttempts: payout.providerAttempts + 1, lastProviderSyncAt: clock(), updatedAt: clock() })
      .where(eq(payouts.id, payout.id))
      .returning();
    return updated!;
  }
}

/** Applies a provider's view of a payout (API response, poll or webhook). */
export async function applyProviderPayout(deps: AppDeps, payoutId: string, provider: ProviderPayout): Promise<PayoutRow> {
  return applyPayoutStatus(deps, payoutId, {
    status: fromProviderStatus(provider.status),
    providerPayoutId: provider.id,
    utr: provider.utr,
    failureReason: provider.failureReason,
  });
}

/**
 * The only place a payout's status changes. Monotonic (see status.ts); reversing states
 * credit the reserved amount back exactly once (unique index on payout_id + type).
 * Amounts always come from our payout row, never from the provider/webhook payload.
 */
export async function applyPayoutStatus(
  deps: AppDeps,
  payoutId: string,
  update: {
    status: PayoutStatus;
    providerPayoutId?: string | null;
    utr?: string | null;
    failureReason?: string | null;
    providerError?: string;
  },
): Promise<PayoutRow> {
  const { db, clock } = deps;
  return db.transaction(async (tx) => {
    const [payout] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).for('update');
    if (!payout) throw new Error(`Payout ${payoutId} not found`);
    const now = clock();
    const moves = canMovePayout(payout.status, update.status);
    const patch: Partial<typeof payouts.$inferInsert> = { lastProviderSyncAt: now };
    if (update.providerPayoutId && !payout.providerPayoutId) patch.providerPayoutId = update.providerPayoutId;
    if (update.utr && !payout.utr) patch.utr = update.utr;
    if (moves) {
      patch.status = update.status;
      patch.updatedAt = now;
      if (update.status === 'processed') patch.processedAt = now;
      if (REVERSING_PAYOUT_STATUSES.includes(update.status)) {
        patch.failureReason = update.failureReason ?? payout.failureReason ?? 'The transfer did not complete.';
      }
    }
    const [updated] = await tx.update(payouts).set(patch).where(eq(payouts.id, payout.id)).returning();

    if (moves && REVERSING_PAYOUT_STATUSES.includes(update.status)) {
      await tx
        .insert(ledgerEntries)
        .values({
          branchId: payout.branchId,
          type: 'payout_reversal',
          amountMinor: payout.amountMinor,
          description: `Withdrawal ${update.status} — amount returned to wallet`,
          payoutId: payout.id,
          availableAt: now,
          createdAt: now,
        })
        .onConflictDoNothing();
    }
    if (moves) {
      await audit(tx, {
        actorUserId: null,
        actorType: 'provider',
        action: `payout.${update.status}`,
        entityType: 'payout',
        entityId: payout.id,
        branchId: payout.branchId,
        metadata: {
          from: payout.status,
          to: update.status,
          ...(update.providerError ? { providerError: maskDigits(update.providerError) } : {}),
        },
      });
    }
    return updated!;
  });
}

/** Removes long digit runs (account numbers) from provider messages before storing them. */
export function maskDigits(message: string): string {
  return message.replace(/\d{6,}/g, (run) => `****${run.slice(-4)}`).slice(0, 500);
}

const STALE_MINUTES = 10;

/**
 * Brings payouts in line with the provider: re-submits `requested` payouts (same
 * idempotency key, so no duplicates) and polls in-flight ones that have not been
 * updated for a while (missed webhooks). Run on a schedule (scripts/reconcile-payouts.ts).
 */
export async function reconcilePayouts(deps: AppDeps): Promise<{ checked: number; updated: number; errors: number }> {
  const { db, clock, payoutProvider } = deps;
  if (payoutProvider.mode === 'unconfigured') return { checked: 0, updated: 0, errors: 0 };
  const staleBefore = new Date(clock().getTime() - STALE_MINUTES * 60_000);
  const candidates = await db
    .select()
    .from(payouts)
    .where(
      or(
        eq(payouts.status, 'requested'),
        and(inArray(payouts.status, ['queued', 'pending_approval', 'processing']), lt(payouts.updatedAt, staleBefore)),
      ),
    )
    .limit(200);
  let updated = 0;
  let errors = 0;
  for (const payout of candidates) {
    try {
      const after =
        payout.status === 'requested'
          ? await submitToProvider(deps, payout.id)
          : payout.providerPayoutId
            ? await applyProviderPayout(deps, payout.id, await payoutProvider.getPayout(payout.providerPayoutId))
            : payout;
      if (after.status !== payout.status) updated += 1;
    } catch {
      errors += 1;
    }
  }
  return { checked: candidates.length, updated, errors };
}
