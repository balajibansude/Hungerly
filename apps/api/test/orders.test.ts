import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { branchClosures, branches, ledgerEntries, orders } from '../src/db/schema';
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
let paneerId: string;
let jainDalId: string;
let soldOutId: string;
let otherBranchItemId: string;

// 2026-10-12 is a Monday. 06:30Z = 12:00 IST (open), 11:00Z = 16:30 IST (break),
// 18:00Z = 23:30 IST (closed for the day).
const NOON_IST = '2026-10-12T06:30:00.000Z';

async function addItem(
  token: string,
  bId: string,
  categoryId: string,
  body: Record<string, unknown>,
) {
  const res = await call<{ id: string }>(ctx, 'POST', `/partner/branches/${bId}/menu/items`, {
    token,
    body: { categoryId, description: '', ...body },
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function addCategory(token: string, bId: string, name: string) {
  const res = await call<{ id: string }>(ctx, 'POST', `/partner/branches/${bId}/menu/categories`, {
    token,
    body: { name },
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

function deps() {
  return { config: ctx.config, clock: () => ctx.clock.now };
}

async function order(
  items: { menuItemId: string; quantity: number }[] = [{ menuItemId: paneerId, quantity: 2 }],
) {
  return placeOrder(ctx.db, deps(), {
    branchId,
    customerName: 'Asha Rao',
    customerPhoneE164: '+919876501234',
    paymentMethod: 'online',
    items,
  });
}

beforeAll(async () => {
  ctx = await createTestContext({ now: NOON_IST });
  owner = await signInOwner(ctx);
  ({
    branch: { id: branchId },
  } = await createActiveBranch(ctx, owner.userId, { commissionBps: 2000 }));
  const mains = await addCategory(owner.token, branchId, 'Mains');
  paneerId = await addItem(owner.token, branchId, mains, {
    name: 'Paneer Tikka',
    priceMinor: 24_900,
    foodType: 'veg',
  });
  jainDalId = await addItem(owner.token, branchId, mains, {
    name: 'Jain Dal Tadka',
    priceMinor: 18_000,
    foodType: 'jain',
  });
  soldOutId = await addItem(owner.token, branchId, mains, {
    name: 'Mutton Biryani',
    priceMinor: 32_000,
    foodType: 'non_veg',
    isAvailable: false,
  });
  const { branch: second } = await createActiveBranch(ctx, owner.userId, {
    name: 'Masala Junction',
  });
  const secondCat = await addCategory(owner.token, second.id, 'Mains');
  otherBranchItemId = await addItem(owner.token, second.id, secondCat, {
    name: 'Dosa',
    priceMinor: 9_000,
    foodType: 'veg',
  });
});
afterAll(async () => {
  await ctx.close();
});

describe('placeOrder', () => {
  it('computes the bill on the server from menu prices', async () => {
    const placed = await order([
      { menuItemId: paneerId, quantity: 2 },
      { menuItemId: jainDalId, quantity: 1 },
    ]);
    expect(placed.subtotalMinor).toBe(2 * 24_900 + 18_000);
    expect(placed.status).toBe('placed');
    expect(placed.acceptBy!.getTime()).toBe(
      ctx.clock.now.getTime() + ctx.config.ORDER_ACCEPT_WINDOW_SECONDS * 1000,
    );
    const dto = await call<{
      customer: { firstName: string; phoneMasked: string };
      items: { foodType: string; name: string }[];
    }>(ctx, 'GET', `/partner/branches/${branchId}/orders/${placed.id}`, { token: owner.token });
    expect(dto.body.customer).toEqual({ firstName: 'Asha', phoneMasked: '+91 ******1234' });
    expect(dto.body.items.find((i) => i.name === 'Jain Dal Tadka')?.foodType).toBe('jain');
  });

  it('rejects unavailable items and items from another branch', async () => {
    await expect(order([{ menuItemId: soldOutId, quantity: 1 }])).rejects.toMatchObject({
      code: 'validation',
    });
    await expect(order([{ menuItemId: otherBranchItemId, quantity: 1 }])).rejects.toMatchObject({
      code: 'validation',
    });
  });

  it('refuses new orders during a break and after closing', async () => {
    ctx.clock.set('2026-10-12T11:00:00.000Z');
    await expect(order()).rejects.toMatchObject({
      code: 'branch.unavailable',
      message: expect.stringContaining('break'),
    });
    ctx.clock.set('2026-10-12T18:00:00.000Z');
    await expect(order()).rejects.toMatchObject({
      code: 'branch.unavailable',
      message: expect.stringContaining('Closed for today'),
    });
    ctx.clock.set(NOON_IST);
  });

  it('refuses new orders when offline, paused or on a holiday', async () => {
    await ctx.db
      .update(branches)
      .set({ isAcceptingOrders: false })
      .where(eq(branches.id, branchId));
    await expect(order()).rejects.toMatchObject({ code: 'branch.unavailable' });
    await ctx.db
      .update(branches)
      .set({
        isAcceptingOrders: true,
        pausedUntil: new Date(ctx.clock.now.getTime() + 30 * 60_000),
      })
      .where(eq(branches.id, branchId));
    await expect(order()).rejects.toMatchObject({
      code: 'branch.unavailable',
      message: expect.stringContaining('paused'),
    });
    await ctx.db.update(branches).set({ pausedUntil: null }).where(eq(branches.id, branchId));
    const [closure] = await ctx.db
      .insert(branchClosures)
      .values({ branchId, date: '2026-10-12', note: 'Diwali' })
      .returning();
    await expect(order()).rejects.toMatchObject({
      code: 'branch.unavailable',
      message: expect.stringContaining('holiday'),
    });
    await ctx.db.delete(branchClosures).where(eq(branchClosures.id, closure!.id));
    await expect(order()).resolves.toMatchObject({ status: 'placed' });
  });

  it('a schedule change on one branch does not affect another branch', async () => {
    const { branch: other } = await createActiveBranch(ctx, owner.userId, { name: 'Night Branch' });
    await ctx.db
      .insert(branchClosures)
      .values({ branchId: other.id, date: '2026-10-12', note: 'Closed' });
    await expect(order()).resolves.toMatchObject({ status: 'placed' });
  });
});

describe('restaurant order actions', () => {
  it('accepts, marks ready, and enforces versions and transitions', async () => {
    const placed = await order();
    const base = `/partner/branches/${branchId}/orders/${placed.id}`;
    const ready = await call<{ code: string }>(ctx, 'POST', `${base}/ready`, {
      token: owner.token,
      body: { expectedVersion: 1 },
    });
    expect(ready.status).toBe(409);
    expect(ready.body.code).toBe('order.invalid_transition');

    const accepted = await call<{ status: string; version: number; prepMinutes: number }>(
      ctx,
      'POST',
      `${base}/accept`,
      {
        token: owner.token,
        body: { prepMinutes: 20, expectedVersion: 1 },
      },
    );
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ status: 'preparing', version: 2, prepMinutes: 20 });

    const duplicate = await call<{ code: string }>(ctx, 'POST', `${base}/accept`, {
      token: owner.token,
      body: { prepMinutes: 20, expectedVersion: 1 },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('order.version_conflict');

    const again = await call<{ code: string }>(ctx, 'POST', `${base}/accept`, {
      token: owner.token,
      body: { prepMinutes: 20, expectedVersion: 2 },
    });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('order.invalid_transition');

    const done = await call<{ status: string; timeline: { status: string }[] }>(
      ctx,
      'POST',
      `${base}/ready`,
      {
        token: owner.token,
        body: { expectedVersion: 2 },
      },
    );
    expect(done.body.status).toBe('ready_for_pickup');
    expect(done.body.timeline.map((e) => e.status)).toEqual([
      'placed',
      'preparing',
      'ready_for_pickup',
    ]);
  });

  it('validates prep minutes', async () => {
    const placed = await order();
    const res = await call(
      ctx,
      'POST',
      `/partner/branches/${branchId}/orders/${placed.id}/accept`,
      {
        token: owner.token,
        body: { prepMinutes: 200, expectedVersion: 1 },
      },
    );
    expect(res.status).toBe(422);
  });

  it('rejects with a reason and moves paid orders to refund pending', async () => {
    const placed = await order();
    const res = await call<{ status: string; cancelledBy: string; paymentStatus: string }>(
      ctx,
      'POST',
      `/partner/branches/${branchId}/orders/${placed.id}/reject`,
      { token: owner.token, body: { reason: 'item_out_of_stock', expectedVersion: 1 } },
    );
    expect(res.body).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'restaurant',
      paymentStatus: 'refund_pending',
    });
  });

  it('expires orders not accepted within the window', async () => {
    const placed = await order();
    ctx.clock.advance((ctx.config.ORDER_ACCEPT_WINDOW_SECONDS + 1) * 1000);
    const res = await call<{ code: string }>(
      ctx,
      'POST',
      `/partner/branches/${branchId}/orders/${placed.id}/accept`,
      {
        token: owner.token,
        body: { prepMinutes: 15, expectedVersion: 1 },
      },
    );
    expect(res.status).toBe(409);
    const [row] = await ctx.db.select().from(orders).where(eq(orders.id, placed.id));
    expect(row).toMatchObject({
      status: 'cancelled',
      cancelledBy: 'system',
      cancelReason: 'not_accepted_in_time',
    });
    ctx.clock.set(NOON_IST);
  });

  it('lists active and history orders with a cursor', async () => {
    const page1 = await call<{
      items: { id: string; status: string }[];
      nextCursor: string | null;
    }>(ctx, 'GET', `/partner/branches/${branchId}/orders?limit=2`, { token: owner.token });
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();
    const page2 = await call<{ items: { id: string }[] }>(
      ctx,
      'GET',
      `/partner/branches/${branchId}/orders?limit=2&cursor=${page1.body.nextCursor}`,
      { token: owner.token },
    );
    expect(page2.body.items.map((o) => o.id)).not.toContain(page1.body.items[0]!.id);
    const active = await call<{ items: { status: string }[] }>(
      ctx,
      'GET',
      `/partner/branches/${branchId}/orders?status=active`,
      {
        token: owner.token,
      },
    );
    expect(
      active.body.items.every((o) =>
        ['placed', 'preparing', 'ready_for_pickup'].includes(o.status),
      ),
    ).toBe(true);
  });
});

describe('delivery and earnings', () => {
  it('posts ledger rows exactly once even if delivery is reported twice', async () => {
    const placed = await order([{ menuItemId: paneerId, quantity: 1 }]);
    const base = `/partner/branches/${branchId}/orders/${placed.id}`;
    await call(ctx, 'POST', `${base}/accept`, {
      token: owner.token,
      body: { prepMinutes: 10, expectedVersion: 1 },
    });
    await call(ctx, 'POST', `${base}/ready`, { token: owner.token, body: { expectedVersion: 2 } });
    await markPickedUp(ctx.db, deps(), placed.id, { riderFirstName: 'Ravi Kumar' });
    await markDelivered(ctx.db, deps(), placed.id);
    await markDelivered(ctx.db, deps(), placed.id);
    const rows = await ctx.db
      .select()
      .from(ledgerEntries)
      .where(eq(ledgerEntries.orderId, placed.id));
    const byType = Object.fromEntries(rows.map((r) => [r.type, r.amountMinor]));
    expect(rows.filter((r) => r.type === 'order_earning')).toHaveLength(1);
    expect(byType.order_earning).toBe(24_900);
    expect(byType.commission).toBe(-4_980);
    expect(byType.commission_tax).toBe(-896);
  });

  it('delivery actions cannot skip states', async () => {
    const placed = await order();
    await expect(markDelivered(ctx.db, deps(), placed.id)).rejects.toMatchObject({
      code: 'order.invalid_transition',
    });
    const [{ n }] = (await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.orderId, placed.id)))) as [{ n: number }];
    expect(n).toBe(0);
  });
});

describe('owner isolation', () => {
  it('another owner cannot see or act on this branch’s orders', async () => {
    const placed = await order();
    const intruder = await signInOwner(ctx);
    await createActiveBranch(ctx, intruder.userId, { name: 'Intruder Kitchen' });
    for (const url of [
      `/partner/branches/${branchId}/orders`,
      `/partner/branches/${branchId}/orders/${placed.id}`,
    ]) {
      const res = await call(ctx, 'GET', url, { token: intruder.token });
      expect(res.status).toBe(404);
    }
    const accept = await call(
      ctx,
      'POST',
      `/partner/branches/${branchId}/orders/${placed.id}/accept`,
      {
        token: intruder.token,
        body: { prepMinutes: 10, expectedVersion: 1 },
      },
    );
    expect(accept.status).toBe(404);
  });

  it('an order id from another branch of the same owner is not found under this branch', async () => {
    const placed = await order();
    const [other] = await ctx.db
      .select()
      .from(branches)
      .where(eq(branches.name, 'Masala Junction'));
    const ids = await ctx.db.select({ id: branches.id }).from(branches);
    const secondId = ids.find((b) => b.id !== branchId && b.id !== other?.id)?.id ?? other!.id;
    const res = await call(ctx, 'GET', `/partner/branches/${secondId}/orders/${placed.id}`, {
      token: owner.token,
    });
    expect(res.status).toBe(404);
  });
});
