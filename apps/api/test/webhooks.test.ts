import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';

import { ledgerEntries, payoutAccounts, payouts, providerWebhookEvents } from '../src/db/schema';
import { DAY, FakePayoutProvider, createDeliveredOrder, signWebhook } from './finance-helpers';
import { call, createActiveBranch, createTestContext, signInOwner, type TestContext } from './harness';

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

async function setup() {
  const provider = new FakePayoutProvider();
  ctx = await createTestContext({ payoutProvider: provider, config: { MIN_WITHDRAWAL_MINOR: '10000' } });
  const owner = await signInOwner(ctx);
  const { branch } = await createActiveBranch(ctx, owner.userId, { verifiedPayoutAccount: true });
  await createDeliveredOrder(ctx, branch.id);
  ctx.clock.advance(3 * DAY);
  const res = await call<{ id: string; status: string }>(ctx, 'POST', `/partner/branches/${branch.id}/payouts`, {
    token: owner.token,
    body: { amountMinor: 20_000 },
    headers: { 'idempotency-key': randomUUID() },
  });
  const [row] = await ctx.db.select().from(payouts).where(eq(payouts.id, res.body.id));
  return { provider, owner, branch, payout: row! };
}

function payoutEvent(event: string, providerPayoutId: string, referenceId: string, extra: object = {}) {
  return JSON.stringify({
    entity: 'event',
    event,
    payload: {
      payout: {
        entity: { id: providerPayoutId, entity: 'payout', amount: 999_999_99, status: event.split('.')[1], reference_id: referenceId, utr: 'UTR123', ...extra },
      },
    },
  });
}

async function deliver(body: string, options: { eventId?: string; signature?: string } = {}) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/v1/webhooks/razorpayx',
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': options.signature ?? signWebhook(body),
      'x-razorpay-event-id': options.eventId ?? `evt_${randomUUID()}`,
    },
    payload: body,
  });
  return res.statusCode;
}

const balance = async (branchId: string, token: string) =>
  (await call<{ available: { amountMinor: number } }>(ctx, 'GET', `/partner/branches/${branchId}/wallet`, { token })).body.available
    .amountMinor;

describe('RazorpayX webhooks', () => {
  it('reject an invalid signature and change nothing', async () => {
    const { payout } = await setup();
    const body = payoutEvent('payout.processed', payout.providerPayoutId!, payout.id);
    expect(await deliver(body, { signature: 'deadbeef' })).toBe(400);
    expect(await deliver(body, { signature: signWebhook(body + ' ') })).toBe(400);
    const [after] = await ctx.db.select().from(payouts).where(eq(payouts.id, payout.id));
    expect(after!.status).toBe('queued');
    expect(await ctx.db.select().from(providerWebhookEvents)).toHaveLength(0);
  });

  it('mark a payout processed (status only, never the payload amount)', async () => {
    const { payout } = await setup();
    expect(await deliver(payoutEvent('payout.processed', payout.providerPayoutId!, payout.id))).toBe(200);
    const [after] = await ctx.db.select().from(payouts).where(eq(payouts.id, payout.id));
    expect(after!.status).toBe('processed');
    expect(after!.utr).toBe('UTR123');
    expect(after!.amountMinor).toBe(20_000);
  });

  it('process a redelivered event once and restore a reversed payout exactly once', async () => {
    const { owner, branch, payout } = await setup();
    expect(await balance(branch.id, owner.token)).toBe(56_400);
    const processed = payoutEvent('payout.processed', payout.providerPayoutId!, payout.id);
    await deliver(processed);
    const reversed = payoutEvent('payout.reversed', payout.providerPayoutId!, payout.id);
    const eventId = `evt_${randomUUID()}`;
    expect(await deliver(reversed, { eventId })).toBe(200);
    expect(await deliver(reversed, { eventId })).toBe(200);
    // A different event id for the same state change still credits only once.
    expect(await deliver(reversed)).toBe(200);
    const reversals = await ctx.db.select().from(ledgerEntries).where(eq(ledgerEntries.type, 'payout_reversal'));
    expect(reversals).toHaveLength(1);
    expect(reversals[0]!.amountMinor).toBe(20_000);
    expect(await balance(branch.id, owner.token)).toBe(76_400);
    expect(await ctx.db.select().from(providerWebhookEvents).where(eq(providerWebhookEvents.eventId, eventId))).toHaveLength(1);
  });

  it('never move a payout backwards on a late event', async () => {
    const { payout } = await setup();
    await deliver(payoutEvent('payout.processed', payout.providerPayoutId!, payout.id));
    await deliver(payoutEvent('payout.processing', payout.providerPayoutId!, payout.id));
    await deliver(payoutEvent('payout.failed', payout.providerPayoutId!, payout.id));
    const [after] = await ctx.db.select().from(payouts).where(eq(payouts.id, payout.id));
    expect(after!.status).toBe('processed');
    expect(await ctx.db.select().from(ledgerEntries).where(eq(ledgerEntries.type, 'payout_reversal'))).toHaveLength(0);
  });

  it('match a payout by reference id and acknowledge unknown payouts', async () => {
    const { payout } = await setup();
    await ctx.db.update(payouts).set({ providerPayoutId: null }).where(eq(payouts.id, payout.id));
    expect(await deliver(payoutEvent('payout.failed', 'pout_other', payout.id))).toBe(200);
    const [after] = await ctx.db.select().from(payouts).where(eq(payouts.id, payout.id));
    expect(after!.status).toBe('failed');
    expect(await deliver(payoutEvent('payout.processed', 'pout_unknown', randomUUID()))).toBe(200);
  });

  it('apply bank validation results to the matching account', async () => {
    const { branch } = await setup();
    const [account] = await ctx.db.select().from(payoutAccounts).where(eq(payoutAccounts.branchId, branch.id));
    await ctx.db
      .update(payoutAccounts)
      .set({ status: 'verification_in_progress', verifiedAt: null, verifiedVia: null, providerValidationId: 'fav_1' })
      .where(eq(payoutAccounts.id, account!.id));
    const body = JSON.stringify({
      event: 'fund_account.validation.completed',
      payload: {
        'fund_account.validation': {
          entity: { id: 'fav_1', status: 'completed', results: { account_status: 'active', registered_name: 'TEST KITCHENS' } },
        },
      },
    });
    expect(await deliver(body)).toBe(200);
    const [after] = await ctx.db.select().from(payoutAccounts).where(eq(payoutAccounts.id, account!.id));
    expect(after!.status).toBe('verified');
    expect(after!.verifiedVia).toBe('provider');
    expect(after!.registeredName).toBe('TEST KITCHENS');
  });
});
