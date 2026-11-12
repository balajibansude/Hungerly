import { afterEach, describe, expect, it } from 'vitest';

import { DAY, createDeliveredOrder } from './finance-helpers';
import { call, createActiveBranch, createTestContext, signInAdmin, signInOwner, type TestContext } from './harness';

let ctx: TestContext;
afterEach(async () => {
  await ctx?.close();
});

const m = (amountMinor: number) => ({ amountMinor, currency: 'INR' });

describe('wallet', () => {
  it('separates gross sales from earnings and deductions', async () => {
    ctx = await createTestContext({ now: '2026-10-12T06:30:00.000Z' });
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId, { commissionBps: 2000 });
    await createDeliveredOrder(ctx, branch.id, { subtotalMinor: 100_000 });
    await createDeliveredOrder(ctx, branch.id, { subtotalMinor: 50_000, restaurantDiscountMinor: 5_000 });

    const summary = await call<Record<string, unknown>>(ctx, 'GET', `/partner/branches/${branch.id}/wallet/summary?from=2026-10-12&to=2026-10-12`, {
      token: owner.token,
    });
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      deliveredOrders: 2,
      grossSales: m(150_000),
      commission: m(30_000),
      commissionTax: m(5_400),
      restaurantDiscounts: m(5_000),
      netEarnings: m(109_600),
      paidOut: m(0),
    });

    const wallet = await call<{ available: unknown; pending: unknown; settlementHoldDays: number }>(ctx, 'GET', `/partner/branches/${branch.id}/wallet`, {
      token: owner.token,
    });
    expect(wallet.body.available).toEqual(m(0));
    expect(wallet.body.pending).toEqual(m(109_600));
    ctx.clock.advance(2 * DAY + 1);
    const later = await call<{ available: unknown; pending: unknown }>(ctx, 'GET', `/partner/branches/${branch.id}/wallet`, { token: owner.token });
    expect(later.body.available).toEqual(m(109_600));
    expect(later.body.pending).toEqual(m(0));
  });

  it('pages transactions and exports a CSV statement in rupees', async () => {
    ctx = await createTestContext({ now: '2026-10-12T06:30:00.000Z' });
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    await createDeliveredOrder(ctx, branch.id, { subtotalMinor: 100_000 });

    const page1 = await call<{ items: { type: string; orderNumber: string | null }[]; nextCursor: string | null }>(
      ctx,
      'GET',
      `/partner/branches/${branch.id}/wallet/transactions?limit=2`,
      { token: owner.token },
    );
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.items[0]!.orderNumber).toMatch(/^HGR-/);
    const page2 = await call<{ items: unknown[]; nextCursor: string | null }>(
      ctx,
      'GET',
      `/partner/branches/${branch.id}/wallet/transactions?limit=2&cursor=${page1.body.nextCursor}`,
      { token: owner.token },
    );
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();

    const csv = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/partner/branches/${branch.id}/wallet/statement.csv?from=2026-10-12&to=2026-10-12`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.body.trim().split('\r\n');
    expect(lines[0]).toBe('Date (IST),Type,Description,Order,Amount (INR),Available from (IST)');
    expect(lines).toHaveLength(4);
    expect(csv.body).toContain('1000.00');
    expect(csv.body).toContain('-200.00');
    expect(csv.body).toContain('2026-10-12 12:00');
  });

  it('rejects summary ranges that are reversed or too long', async () => {
    ctx = await createTestContext();
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    expect((await call(ctx, 'GET', `/partner/branches/${branch.id}/wallet/summary?from=2026-10-12&to=2026-10-01`, { token: owner.token })).status).toBe(422);
    expect((await call(ctx, 'GET', `/partner/branches/${branch.id}/wallet/summary?from=2026-01-01&to=2026-10-01`, { token: owner.token })).status).toBe(422);
  });

  it('applies finance adjustments with an audit trail, never from the owner', async () => {
    ctx = await createTestContext();
    const owner = await signInOwner(ctx);
    const { branch } = await createActiveBranch(ctx, owner.userId);
    const body = { amountMinor: -2_500, kind: 'refund_deduction', reason: 'Wrong item delivered (veg/non-veg mix-up)', orderId: null };
    expect((await call(ctx, 'POST', `/admin/branches/${branch.id}/ledger-adjustments`, { token: owner.token, body })).status).toBe(401);
    const ops = await signInAdmin(ctx, 'operations');
    expect((await call(ctx, 'POST', `/admin/branches/${branch.id}/ledger-adjustments`, { token: ops.token, body })).status).toBe(403);
    const finance = await signInAdmin(ctx, 'finance');
    const res = await call<{ type: string; amount: unknown }>(ctx, 'POST', `/admin/branches/${branch.id}/ledger-adjustments`, { token: finance.token, body });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'refund_deduction', amount: m(-2_500) });
    const positive = await call(ctx, 'POST', `/admin/branches/${branch.id}/ledger-adjustments`, {
      token: finance.token,
      body: { ...body, amountMinor: 2_500 },
    });
    expect(positive.status).toBe(422);
    const wallet = await call<{ available: unknown }>(ctx, 'GET', `/partner/branches/${branch.id}/wallet`, { token: owner.token });
    expect(wallet.body.available).toEqual(m(-2_500));
  });
});
