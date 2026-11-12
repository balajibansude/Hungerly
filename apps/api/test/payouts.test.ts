import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { branches, ledgerEntries, payouts } from '../src/db/schema';
import { ProviderRequestError } from '../src/modules/payouts/provider';
import { DAY, FakePayoutProvider, createDeliveredOrder } from './finance-helpers';
import { call, createActiveBranch, createTestContext, signInAdmin, signInOwner, type TestContext } from './harness';

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

interface WalletBody {
  available: { amountMinor: number };
  pending: { amountMinor: number };
  inFlightPayouts: { amountMinor: number };
  provider: { mode: string };
  eligibility: { canWithdraw: boolean; blockers: { code: string }[] };
}
interface PayoutBody {
  id: string;
  status: string;
  amount: { amountMinor: number };
  destinationLast4: string;
}

/** Owner with an active branch, a verified account and ₹764 available (one ₹1,000 order). */
async function fundedBranch(provider: FakePayoutProvider | undefined) {
  ctx = await createTestContext({ ...(provider ? { payoutProvider: provider } : {}), config: { MIN_WITHDRAWAL_MINOR: '10000' } });
  const owner = await signInOwner(ctx);
  const { branch } = await createActiveBranch(ctx, owner.userId, { verifiedPayoutAccount: true });
  await createDeliveredOrder(ctx, branch.id);
  ctx.clock.advance(3 * DAY); // past the 2-day settlement hold
  return { owner, branch };
}

const withdraw = (branchId: string, token: string, amountMinor: number, key: string = randomUUID(), extra: object = {}) =>
  call<PayoutBody & { code?: string }>(ctx, 'POST', `/partner/branches/${branchId}/payouts`, {
    token,
    body: { amountMinor, ...extra },
    headers: { 'idempotency-key': key },
  });

describe('withdrawals', () => {
  it('are disabled with a clear status when no provider is configured', async () => {
    const { owner, branch } = await fundedBranch(undefined);
    const wallet = await call<WalletBody>(ctx, 'GET', `/partner/branches/${branch.id}/wallet`, { token: owner.token });
    expect(wallet.body.provider.mode).toBe('unconfigured');
    expect(wallet.body.available.amountMinor).toBe(76_400);
    expect(wallet.body.eligibility.canWithdraw).toBe(false);
    expect(wallet.body.eligibility.blockers.map((b) => b.code)).toContain('provider_unconfigured');
    const res = await withdraw(branch.id, owner.token, 20_000);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('payout.provider_unconfigured');
  });

  it('requires a UUID Idempotency-Key header', async () => {
    const { owner, branch } = await fundedBranch(new FakePayoutProvider());
    const res = await call<{ code: string }>(ctx, 'POST', `/partner/branches/${branch.id}/payouts`, {
      token: owner.token,
      body: { amountMinor: 20_000 },
    });
    expect(res.status).toBe(400);
  });

  it('creates exactly one payout and one provider call for a repeated key', async () => {
    const provider = new FakePayoutProvider();
    const { owner, branch } = await fundedBranch(provider);
    const key = randomUUID();
    const first = await withdraw(branch.id, owner.token, 20_000, key);
    const second = await withdraw(branch.id, owner.token, 20_000, key);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(provider.callsOf('createPayout')).toHaveLength(1);
    expect(await ctx.db.select().from(payouts).where(eq(payouts.branchId, branch.id))).toHaveLength(1);
    const debits = await ctx.db.select().from(ledgerEntries).where(eq(ledgerEntries.type, 'payout'));
    expect(debits).toHaveLength(1);

    const reused = await withdraw(branch.id, owner.token, 30_000, key);
    expect(reused.status).toBe(409);
    expect(reused.body.code).toBe('idempotency_conflict');
  });

  it('never overdraws when requests race', async () => {
    const provider = new FakePayoutProvider();
    const { owner, branch } = await fundedBranch(provider);
    const results = await Promise.all([
      withdraw(branch.id, owner.token, 60_000),
      withdraw(branch.id, owner.token, 60_000),
      withdraw(branch.id, owner.token, 60_000),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.body.code === 'payout.insufficient_balance')).toHaveLength(2);
    const wallet = await call<WalletBody>(ctx, 'GET', `/partner/branches/${branch.id}/wallet`, { token: owner.token });
    expect(wallet.body.available.amountMinor).toBe(16_400);
  });

  it('takes status only from the provider, never from the client', async () => {
    const provider = new FakePayoutProvider();
    const { owner, branch } = await fundedBranch(provider);
    const res = await withdraw(branch.id, owner.token, 20_000, randomUUID(), {
      status: 'processed',
      balance: 999_999_99,
      available: { amountMinor: 999_999_99 },
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('queued');
    // There is no write endpoint for balances or payout status.
    const patch = await call(ctx, 'PATCH', `/partner/branches/${branch.id}/payouts/${res.body.id}`, {
      token: owner.token,
      body: { status: 'processed' },
    });
    expect(patch.status).toBe(404);
    const putWallet = await call(ctx, 'PUT', `/partner/branches/${branch.id}/wallet`, {
      token: owner.token,
      body: { available: { amountMinor: 1_000_000, currency: 'INR' } },
    });
    expect(putWallet.status).toBe(404);
    const wallet = await call<WalletBody>(ctx, 'GET', `/partner/branches/${branch.id}/wallet`, { token: owner.token });
    expect(wallet.body.available.amountMinor).toBe(56_400);
    expect(wallet.body.inFlightPayouts.amountMinor).toBe(20_000);
  });

  it('refuses below the minimum, above the balance, or without a verified account', async () => {
    const provider = new FakePayoutProvider();
    const { owner, branch } = await fundedBranch(provider);
    expect((await withdraw(branch.id, owner.token, 5_000)).body.code).toBe('payout.below_minimum');
    expect((await withdraw(branch.id, owner.token, 80_000)).body.code).toBe('payout.insufficient_balance');

    const other = await createActiveBranch(ctx, owner.userId, { name: 'Masala Junction' });
    await createDeliveredOrder(ctx, other.branch.id, { deliveredAt: new Date(ctx.clock.now.getTime() - 3 * DAY) });
    expect((await withdraw(other.branch.id, owner.token, 20_000)).body.code).toBe('payout.account_unverified');

    await ctx.db.update(branches).set({ status: 'suspended' }).where(eq(branches.id, branch.id));
    expect((await withdraw(branch.id, owner.token, 20_000)).body.code).toBe('payout.not_eligible');
    expect(provider.callsOf('createPayout')).toHaveLength(0);
  });

  it('keeps pending earnings out of the withdrawable balance', async () => {
    ctx = await createTestContext({ payoutProvider: new FakePayoutProvider() });
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId, { verifiedPayoutAccount: true });
    await createDeliveredOrder(ctx, branch.id);
    const wallet = await call<WalletBody>(ctx, 'GET', `/partner/branches/${branch.id}/wallet`, { token: owner.token });
    expect(wallet.body.available.amountMinor).toBe(0);
    expect(wallet.body.pending.amountMinor).toBe(76_400);
    expect((await withdraw(branch.id, owner.token, 60_000)).body.code).toBe('payout.insufficient_balance');
  });

  it('returns the money once when the provider declines', async () => {
    const provider = new FakePayoutProvider();
    const { owner, branch } = await fundedBranch(provider);
    provider.failNext = new ProviderRequestError('RazorpayX 400: invalid', 400, false);
    const res = await withdraw(branch.id, owner.token, 20_000);
    expect(res.body.status).toBe('failed');
    const reversals = await ctx.db.select().from(ledgerEntries).where(eq(ledgerEntries.type, 'payout_reversal'));
    expect(reversals).toHaveLength(1);
    const wallet = await call<WalletBody>(ctx, 'GET', `/partner/branches/${branch.id}/wallet`, { token: owner.token });
    expect(wallet.body.available.amountMinor).toBe(76_400);
  });

  it('keeps an unreachable-provider payout reserved and reconciles it with the same key', async () => {
    const provider = new FakePayoutProvider();
    const { owner, branch } = await fundedBranch(provider);
    provider.failNext = new ProviderRequestError('timeout', null, true);
    const res = await withdraw(branch.id, owner.token, 20_000);
    expect(res.body.status).toBe('requested');

    provider.payoutStatus = 'processed';
    const admin = await signInAdmin(ctx, 'finance');
    const reconciled = await call<{ checked: number; updated: number }>(ctx, 'POST', '/admin/payouts/reconcile', { token: admin.token });
    expect(reconciled.body).toMatchObject({ checked: 1, updated: 1 });
    const keys = provider.callsOf('createPayout').map((c) => (c.args as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual([res.body.id, res.body.id]);
    const detail = await call<PayoutBody>(ctx, 'GET', `/partner/branches/${branch.id}/payouts/${res.body.id}`, { token: owner.token });
    expect(detail.body.status).toBe('processed');
    expect(detail.body.destinationLast4).toBe('6789');
  });

  it('isolates one owner’s payouts from another', async () => {
    const provider = new FakePayoutProvider();
    const { owner, branch } = await fundedBranch(provider);
    const res = await withdraw(branch.id, owner.token, 20_000);
    const intruder = await signInOwner(ctx);
    await createActiveBranch(ctx, intruder.userId);
    expect((await call(ctx, 'GET', `/partner/branches/${branch.id}/wallet`, { token: intruder.token })).status).toBe(404);
    expect((await call(ctx, 'GET', `/partner/branches/${branch.id}/payouts/${res.body.id}`, { token: intruder.token })).status).toBe(404);
    expect((await withdraw(branch.id, intruder.token, 20_000)).status).toBe(404);
  });

  it('lists payouts newest first with paging', async () => {
    const provider = new FakePayoutProvider();
    const { owner, branch } = await fundedBranch(provider);
    for (let i = 0; i < 3; i += 1) {
      await withdraw(branch.id, owner.token, 10_000);
      ctx.clock.advance(1000);
    }
    const page1 = await call<{ items: PayoutBody[]; nextCursor: string | null }>(ctx, 'GET', `/partner/branches/${branch.id}/payouts?limit=2`, { token: owner.token });
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();
    const page2 = await call<{ items: PayoutBody[]; nextCursor: string | null }>(
      ctx,
      'GET',
      `/partner/branches/${branch.id}/payouts?limit=2&cursor=${page1.body.nextCursor}`,
      { token: owner.token },
    );
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();
  });
});
