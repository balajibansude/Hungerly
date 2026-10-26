import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { auditLogs, payoutAccounts } from '../src/db/schema';
import { DAY, FakePayoutProvider, approveBankProof, createDeliveredOrder } from './finance-helpers';
import { call, createActiveBranch, createTestContext, signInAdmin, signInOwner, type TestContext } from './harness';

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

const ACCOUNT = '123456789012';
const details = { accountHolderName: 'Test Kitchens Pvt Ltd', accountNumber: ACCOUNT, confirmAccountNumber: ACCOUNT, ifsc: 'hdfc0001234' };

interface AccountResponse {
  current: { id: string; status: string; accountNumberLast4: string; ifsc: string; failureReason: string | null } | null;
  nextStep: string | null;
}

describe('payout accounts', () => {
  it('stores the number encrypted, returns only the last four digits and needs verification', async () => {
    ctx = await createTestContext();
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    const res = await call<AccountResponse>(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, { token: owner.token, body: details });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(ACCOUNT);
    expect(res.body.current).toMatchObject({ status: 'pending_verification', accountNumberLast4: '9012', ifsc: 'HDFC0001234' });
    expect(res.body.nextStep).toMatch(/finance will verify/i);

    const [row] = await ctx.db.select().from(payoutAccounts).where(eq(payoutAccounts.branchId, branch.id));
    expect(row!.accountNumberCiphertext).toBeTruthy();
    expect(row!.accountNumberCiphertext).not.toContain(ACCOUNT);
    const logs = await ctx.db.select().from(auditLogs).where(eq(auditLogs.entityType, 'payout_account'));
    expect(JSON.stringify(logs)).not.toContain(ACCOUNT);
  });

  it('rejects mismatched confirmation and invalid IFSC', async () => {
    ctx = await createTestContext();
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    const res = await call<{ code: string; errors: Record<string, string[]> }>(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, {
      token: owner.token,
      body: { ...details, confirmAccountNumber: '999', ifsc: 'BAD' },
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('validation');
  });

  it('isolates bank details between owners and branches', async () => {
    ctx = await createTestContext();
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    const second = await createActiveBranch(ctx, owner.userId, { name: 'Masala Junction' });
    await call(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, { token: owner.token, body: details });

    const otherBranch = await call<AccountResponse>(ctx, 'GET', `/partner/branches/${second.branch.id}/payout-account`, { token: owner.token });
    expect(otherBranch.body.current).toBeNull();

    const intruder = await signInOwner(ctx);
    await createActiveBranch(ctx, intruder.userId);
    expect((await call(ctx, 'GET', `/partner/branches/${branch.id}/payout-account`, { token: intruder.token })).status).toBe(404);
    expect(
      (await call(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, { token: intruder.token, body: details })).status,
    ).toBe(404);
  });

  it('requires re-verification after a change and blocks payouts until then', async () => {
    const provider = new FakePayoutProvider();
    ctx = await createTestContext({ payoutProvider: provider, config: { MIN_WITHDRAWAL_MINOR: '10000' } });
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId, { verifiedPayoutAccount: true });
    await createDeliveredOrder(ctx, branch.id);
    ctx.clock.advance(3 * DAY);

    const changed = await call<AccountResponse>(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, { token: owner.token, body: details });
    expect(changed.body.current?.status).toBe('pending_verification');
    const rows = await ctx.db.select().from(payoutAccounts).where(eq(payoutAccounts.branchId, branch.id));
    expect(rows.filter((r) => r.isCurrent)).toHaveLength(1);
    expect(rows.find((r) => !r.isCurrent)?.status).toBe('disabled');

    const payout = await call<{ code: string }>(ctx, 'POST', `/partner/branches/${branch.id}/payouts`, {
      token: owner.token,
      body: { amountMinor: 20_000 },
      headers: { 'idempotency-key': randomUUID() },
    });
    expect(payout.body.code).toBe('payout.account_unverified');
  });

  it('registers with the provider in test mode, erases the number and leaves verification to finance', async () => {
    const provider = new FakePayoutProvider('test');
    ctx = await createTestContext({ payoutProvider: provider });
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    const res = await call<AccountResponse>(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, { token: owner.token, body: details });
    expect(res.body.current?.status).toBe('pending_verification');
    expect(provider.callsOf('createFundAccount')).toHaveLength(1);
    expect(provider.callsOf('validateFundAccount')).toHaveLength(0);
    const [row] = await ctx.db.select().from(payoutAccounts).where(eq(payoutAccounts.branchId, branch.id));
    expect(row!.providerFundAccountId).toBeTruthy();
    expect(row!.accountNumberCiphertext).toBeNull();

    // A second account for the same branch reuses the provider contact.
    await call(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, { token: owner.token, body: { ...details, accountNumber: '223456789012', confirmAccountNumber: '223456789012' } });
    expect(provider.callsOf('createContact')).toHaveLength(1);
  });

  it('verifies through the provider in live mode', async () => {
    const provider = new FakePayoutProvider('live');
    ctx = await createTestContext({ payoutProvider: provider });
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    const res = await call<AccountResponse>(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, { token: owner.token, body: details });
    expect(res.body.current?.status).toBe('verification_in_progress');
    const refreshed = await call<AccountResponse>(ctx, 'POST', `/partner/branches/${branch.id}/payout-account/refresh`, { token: owner.token });
    expect(refreshed.body.current?.status).toBe('verified');
    expect(refreshed.body.nextStep).toBeNull();
  });

  it('marks an account failed when the bank reports it invalid', async () => {
    const provider = new FakePayoutProvider('live');
    provider.validationResult = 'invalid';
    ctx = await createTestContext({ payoutProvider: provider });
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    await call(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, { token: owner.token, body: details });
    const refreshed = await call<AccountResponse>(ctx, 'POST', `/partner/branches/${branch.id}/payout-account/refresh`, { token: owner.token });
    expect(refreshed.body.current?.status).toBe('failed');
    expect(refreshed.body.nextStep).toMatch(/failed/i);
  });

  it('lets finance verify only with an approved bank proof, and never the owner', async () => {
    ctx = await createTestContext();
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    const saved = await call<AccountResponse>(ctx, 'POST', `/partner/branches/${branch.id}/payout-account`, { token: owner.token, body: details });
    const accountId = saved.body.current!.id;
    const body = { note: 'Matched cancelled cheque' };

    expect((await call(ctx, 'POST', `/admin/payout-accounts/${accountId}/verify`, { token: owner.token, body })).status).toBe(401);
    const support = await signInAdmin(ctx, 'support');
    expect((await call(ctx, 'POST', `/admin/payout-accounts/${accountId}/verify`, { token: support.token, body })).status).toBe(403);

    const finance = await signInAdmin(ctx, 'finance');
    const blocked = await call<{ code: string }>(ctx, 'POST', `/admin/payout-accounts/${accountId}/verify`, { token: finance.token, body });
    expect(blocked.status).toBe(422);

    await approveBankProof(ctx, branch.id, owner.userId);
    const verified = await call<{ status: string; verifiedVia: string }>(ctx, 'POST', `/admin/payout-accounts/${accountId}/verify`, { token: finance.token, body });
    expect(verified.status).toBe(200);
    expect(verified.body).toMatchObject({ status: 'verified', verifiedVia: 'finance_review' });

    const list = await call<{ items: unknown[] }>(ctx, 'GET', '/admin/payout-accounts?status=verified', { token: finance.token });
    expect(list.body.items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(ACCOUNT);
  });
});
