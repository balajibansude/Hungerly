import { and, eq, isNotNull } from 'drizzle-orm';

import type { PayoutAccount, PayoutAccountResponse, SetPayoutAccount } from '@hungerly/api-client';

import type { AppDeps } from '../../app';
import type { BranchRow } from '../../auth/guard';
import type { Db } from '../../db/client';
import { businesses, payoutAccounts } from '../../db/schema';
import { audit } from '../../lib/audit';
import { decryptField, encryptField, hmacHex } from '../../lib/crypto';
import type { PayoutProvider, ProviderValidation } from './provider';

export type PayoutAccountRow = typeof payoutAccounts.$inferSelect;

/** Never includes the account number: last four digits only. */
export function toAccountDto(row: PayoutAccountRow): PayoutAccount {
  return {
    id: row.id,
    branchId: row.branchId,
    accountHolderName: row.accountHolderName,
    accountNumberLast4: row.accountLast4,
    ifsc: row.ifsc,
    status: row.status,
    registeredName: row.registeredName,
    failureReason: row.failureReason,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedVia: row.verifiedVia ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function nextStepFor(row: PayoutAccountRow | null, provider: PayoutProvider): string | null {
  if (!row) return 'Add the bank account where this branch should receive payouts.';
  switch (row.status) {
    case 'verified':
      return null;
    case 'verification_in_progress':
      return 'Your bank is confirming this account. This usually takes a few minutes.';
    case 'failed':
      return `Verification failed${row.failureReason ? `: ${row.failureReason}` : ''}. Check the details and add the account again.`;
    case 'disabled':
      return 'This account is disabled. Add a new bank account.';
    case 'pending_verification':
    default:
      return provider.supportsAccountValidation && row.providerFundAccountId
        ? 'Verification will start shortly. Pull to refresh to check.'
        : 'Swaadone finance will verify this account using your bank proof document. Payouts start once it is verified.';
  }
}

export async function currentAccount(db: Db, branchId: string): Promise<PayoutAccountRow | null> {
  const [row] = await db
    .select()
    .from(payoutAccounts)
    .where(and(eq(payoutAccounts.branchId, branchId), eq(payoutAccounts.isCurrent, true)))
    .limit(1);
  return row ?? null;
}

export async function accountResponse(deps: AppDeps, branchId: string): Promise<PayoutAccountResponse> {
  const row = await currentAccount(deps.db, branchId);
  return { current: row ? toAccountDto(row) : null, nextStep: nextStepFor(row, deps.payoutProvider) };
}

const PROVIDER_REGISTRATION_FAILED =
  'Could not register this account with the payout provider. Swaadone finance will review it.';

/**
 * Saves a new payout destination for a branch. The previous account stops being current
 * in the same transaction, so a change always needs fresh verification before any
 * payout. Then registers the account with the provider when one is configured.
 */
export async function setPayoutAccount(
  deps: AppDeps,
  input: { branch: BranchRow; userId: string; details: SetPayoutAccount; ip: string | null },
): Promise<PayoutAccountRow> {
  const { db, config, clock } = deps;
  const { branch, details } = input;
  const now = clock();
  const accountNumber = details.accountNumber;
  const last4 = accountNumber.slice(-4);

  const saved = await db.transaction(async (tx) => {
    const previous = await tx
      .update(payoutAccounts)
      // verified_at is cleared because the CHECK ties it to status 'verified'; the
      // verification itself stays in the audit log.
      .set({ isCurrent: false, status: 'disabled', verifiedAt: null, updatedAt: now })
      .where(and(eq(payoutAccounts.branchId, branch.id), eq(payoutAccounts.isCurrent, true)))
      .returning({ id: payoutAccounts.id, last4: payoutAccounts.accountLast4, status: payoutAccounts.status });
    const [row] = await tx
      .insert(payoutAccounts)
      .values({
        branchId: branch.id,
        accountHolderName: details.accountHolderName,
        accountLast4: last4,
        ifsc: details.ifsc,
        accountNumberCiphertext: encryptField(config.FIELD_ENCRYPTION_KEY, accountNumber),
        accountFingerprint: hmacHex(config.TOKEN_HASH_SECRET, `bank:${details.ifsc}:${accountNumber}`),
        status: 'pending_verification',
        isCurrent: true,
        createdBy: input.userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    await audit(tx, {
      actorUserId: input.userId,
      actorType: 'owner',
      action: previous.length ? 'payout_account.changed' : 'payout_account.added',
      entityType: 'payout_account',
      entityId: row!.id,
      branchId: branch.id,
      metadata: {
        last4,
        ifsc: details.ifsc,
        replaced: previous.map((p) => ({ id: p.id, last4: p.last4, status: p.status })),
      },
      ip: input.ip,
    });
    return row!;
  });

  if (deps.payoutProvider.mode === 'unconfigured') return saved;
  return (await ensureFundAccount(deps, saved, branch)) ?? saved;
}

/**
 * Registers the account with the provider (contact + fund account), erases the stored
 * ciphertext once the provider holds the number, and starts bank validation where the
 * provider supports it (RazorpayX live mode only). Failures are recorded on the row with
 * a generic message; provider text can contain account numbers and is not stored.
 */
export async function ensureFundAccount(
  deps: AppDeps,
  account: PayoutAccountRow,
  branch: BranchRow,
): Promise<PayoutAccountRow | null> {
  const { db, config, payoutProvider: provider, clock } = deps;
  if (provider.mode === 'unconfigured') return null;
  let row = account;
  try {
    if (!row.providerFundAccountId) {
      if (!row.accountNumberCiphertext) return row;
      const contactId = row.providerContactId ?? (await findOrCreateContact(deps, branch));
      const { fundAccountId } = await provider.createFundAccount({
        contactId,
        holderName: row.accountHolderName,
        ifsc: row.ifsc,
        accountNumber: decryptField(config.FIELD_ENCRYPTION_KEY, row.accountNumberCiphertext),
      });
      [row] = await db
        .update(payoutAccounts)
        .set({
          providerContactId: contactId,
          providerFundAccountId: fundAccountId,
          accountNumberCiphertext: null,
          failureReason: null,
          updatedAt: clock(),
        })
        .where(eq(payoutAccounts.id, row.id))
        .returning() as [PayoutAccountRow];
    }
    if (provider.supportsAccountValidation && row.status === 'pending_verification' && row.providerFundAccountId) {
      const validation = await provider.validateFundAccount({ fundAccountId: row.providerFundAccountId, referenceId: row.id });
      [row] = await db
        .update(payoutAccounts)
        .set({ providerValidationId: validation.id, status: 'verification_in_progress', updatedAt: clock() })
        .where(eq(payoutAccounts.id, row.id))
        .returning() as [PayoutAccountRow];
      if (validation.status !== 'created') row = (await applyValidation(deps, row.id, validation)) ?? row;
    }
    return row;
  } catch {
    const [failed] = await db
      .update(payoutAccounts)
      .set({ failureReason: PROVIDER_REGISTRATION_FAILED, updatedAt: clock() })
      .where(eq(payoutAccounts.id, row.id))
      .returning();
    return failed ?? row;
  }
}

/** One provider contact per branch: reuse it across account changes. */
async function findOrCreateContact(deps: AppDeps, branch: BranchRow): Promise<string> {
  const [existing] = await deps.db
    .select({ contactId: payoutAccounts.providerContactId })
    .from(payoutAccounts)
    .where(and(eq(payoutAccounts.branchId, branch.id), isNotNull(payoutAccounts.providerContactId)))
    .limit(1);
  if (existing?.contactId) return existing.contactId;
  const [business] = await deps.db
    .select({ legalName: businesses.legalName })
    .from(businesses)
    .where(eq(businesses.id, branch.businessId))
    .limit(1);
  const { contactId } = await deps.payoutProvider.createContact({
    referenceId: branch.id,
    name: `${business?.legalName ?? branch.name} - ${branch.name}`.slice(0, 50),
    email: branch.email,
    phone: branch.phoneE164,
  });
  return contactId;
}

/** Applies a provider validation result to the account it belongs to. */
export async function applyValidation(
  deps: AppDeps,
  accountId: string,
  validation: ProviderValidation,
): Promise<PayoutAccountRow | null> {
  const { db, clock } = deps;
  const [row] = await db.select().from(payoutAccounts).where(eq(payoutAccounts.id, accountId)).limit(1);
  if (!row || !row.isCurrent || row.status === 'verified' || row.status === 'disabled') return row ?? null;
  if (validation.status === 'created') return row;
  const now = clock();
  const ok = validation.status === 'completed' && validation.accountStatus === 'active';
  const [updated] = await db
    .update(payoutAccounts)
    .set(
      ok
        ? {
            status: 'verified',
            verifiedAt: now,
            verifiedVia: 'provider',
            registeredName: validation.registeredName,
            failureReason: null,
            updatedAt: now,
          }
        : {
            status: 'failed',
            registeredName: validation.registeredName,
            failureReason: 'The bank reported this account as invalid',
            updatedAt: now,
          },
    )
    .where(eq(payoutAccounts.id, row.id))
    .returning();
  await audit(db, {
    actorUserId: null,
    actorType: 'provider',
    action: ok ? 'payout_account.verified' : 'payout_account.verification_failed',
    entityType: 'payout_account',
    entityId: row.id,
    branchId: row.branchId,
    metadata: { last4: row.accountLast4, via: 'provider' },
  });
  return updated ?? null;
}

/** Polls the provider for a pending validation (pull-to-refresh). */
export async function refreshValidation(deps: AppDeps, branch: BranchRow): Promise<void> {
  const row = await currentAccount(deps.db, branch.id);
  if (!row || deps.payoutProvider.mode === 'unconfigured') return;
  if (row.status === 'pending_verification') {
    await ensureFundAccount(deps, row, branch);
    return;
  }
  if (row.status === 'verification_in_progress' && row.providerValidationId) {
    try {
      await applyValidation(deps, row.id, await deps.payoutProvider.getValidation(row.providerValidationId));
    } catch {
      // Provider unreachable: keep the current state; the owner can retry.
    }
  }
}
