import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { documents, menuCategories, menuItems } from '../src/db/schema';
import { markDelivered, markPickedUp, placeOrder } from '../src/modules/orders/service';
import {
  call,
  createActiveBranch,
  createTestContext,
  signInOwner,
  type TestContext,
} from './harness';

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof signInOwner>>;
let branchId: string;
let itemId: string;

type DashboardBody = {
  date: string;
  orderCounts: Record<string, number>;
  grossSalesToday: { amountMinor: number };
  trend: { date: string; orders: number; grossSales: { amountMinor: number } }[];
  pendingActions: { kind: string; message: string }[];
  includesDevFixtures: boolean;
};

const deps = () => ({ config: ctx.config, clock: () => ctx.clock.now });

beforeAll(async () => {
  ctx = await createTestContext({ now: '2026-10-11T06:30:00.000Z' });
  owner = await signInOwner(ctx);
  ({
    branch: { id: branchId },
  } = await createActiveBranch(ctx, owner.userId));
  const [cat] = await ctx.db.insert(menuCategories).values({ branchId, name: 'Mains' }).returning();
  const [item] = await ctx.db
    .insert(menuItems)
    .values({ branchId, categoryId: cat!.id, name: 'Thali', priceMinor: 20_000, foodType: 'veg' })
    .returning();
  itemId = item!.id;
  // Yesterday: one delivered order. Today (2026-10-12 IST): one placed, one cancelled.
  await placeOrder(ctx.db, deps(), {
    branchId,
    customerName: 'A',
    paymentMethod: 'cod',
    items: [{ menuItemId: itemId, quantity: 1 }],
  });
  ctx.clock.set('2026-10-12T06:30:00.000Z');
  await placeOrder(ctx.db, deps(), {
    branchId,
    customerName: 'B',
    paymentMethod: 'online',
    items: [{ menuItemId: itemId, quantity: 2 }],
    isDevFixture: true,
  });
  const c = await placeOrder(ctx.db, deps(), {
    branchId,
    customerName: 'C',
    paymentMethod: 'online',
    items: [{ menuItemId: itemId, quantity: 1 }],
  });
  await call(ctx, 'POST', `/partner/branches/${branchId}/orders/${c.id}/reject`, {
    token: owner.token,
    body: { reason: 'too_busy', expectedVersion: 1 },
  });
});
afterAll(async () => {
  await ctx.close();
});

describe('dashboard', () => {
  it('counts today’s orders in IST and excludes cancelled orders from sales', async () => {
    const res = await call<DashboardBody>(ctx, 'GET', `/partner/branches/${branchId}/dashboard`, {
      token: owner.token,
    });
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-10-12');
    expect(res.body.orderCounts.placed).toBe(1);
    expect(res.body.orderCounts.cancelled).toBe(1);
    expect(res.body.grossSalesToday.amountMinor).toBe(40_000);
    expect(res.body.trend).toHaveLength(7);
    expect(res.body.trend.at(-1)).toMatchObject({ date: '2026-10-12', orders: 1 });
    expect(res.body.includesDevFixtures).toBe(true);
    expect(res.body.pendingActions.map((a) => a.kind)).toContain('orders_waiting');
    expect(res.body.pendingActions.map((a) => a.kind)).toContain('payout_account_missing');
  });

  it('shows the earlier day in the trend', async () => {
    const res = await call<DashboardBody>(
      ctx,
      'GET',
      `/partner/branches/${branchId}/dashboard?date=2026-10-11`,
      { token: owner.token },
    );
    expect(res.body.date).toBe('2026-10-11');
    expect(res.body.trend.at(-1)?.date).toBe('2026-10-11');
  });

  it('derives pending actions from documents and payouts', async () => {
    await ctx.db.insert(documents).values({
      branchId,
      type: 'fssai_license',
      documentNumber: '12345678901234',
      storageKey: 'docs/x.pdf',
      fileName: 'licence.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 100,
      sha256: 'x',
      status: 'rejected',
      rejectionReason: 'Blurry scan',
      submittedBy: owner.userId,
      reviewedAt: ctx.clock.now,
    });
    const res = await call<DashboardBody>(ctx, 'GET', `/partner/branches/${branchId}/dashboard`, {
      token: owner.token,
    });
    const rejected = res.body.pendingActions.find((a) => a.kind === 'document_rejected');
    expect(rejected?.message).toContain('Blurry scan');
  });

  it('another owner gets 404', async () => {
    const intruder = await signInOwner(ctx);
    const res = await call(ctx, 'GET', `/partner/branches/${branchId}/dashboard`, {
      token: intruder.token,
    });
    expect(res.status).toBe(404);
  });

  it('counts delivered orders', async () => {
    const o = await placeOrder(ctx.db, deps(), {
      branchId,
      customerName: 'D',
      paymentMethod: 'cod',
      items: [{ menuItemId: itemId, quantity: 1 }],
    });
    await call(ctx, 'POST', `/partner/branches/${branchId}/orders/${o.id}/accept`, {
      token: owner.token,
      body: { prepMinutes: 10, expectedVersion: 1 },
    });
    await call(ctx, 'POST', `/partner/branches/${branchId}/orders/${o.id}/ready`, {
      token: owner.token,
      body: { expectedVersion: 2 },
    });
    await markPickedUp(ctx.db, deps(), o.id);
    await markDelivered(ctx.db, deps(), o.id);
    const res = await call<DashboardBody>(ctx, 'GET', `/partner/branches/${branchId}/dashboard`, {
      token: owner.token,
    });
    expect(res.body.orderCounts.delivered).toBe(1);
    expect(res.body.grossSalesToday.amountMinor).toBe(60_000);
  });
});
