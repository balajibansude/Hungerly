import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { menuCategories, menuItems } from '../src/db/schema';
import { call, createActiveBranch, createTestContext, signInAdmin, signInOwner, type TestContext } from './harness';

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof signInOwner>>;
let branchId: string;

beforeEach(async () => {
  ctx = await createTestContext({ now: '2026-10-12T06:30:00.000Z' });
  owner = await signInOwner(ctx);
  branchId = (await createActiveBranch(ctx, owner.userId)).branch.id;
});
afterEach(async () => {
  await ctx.close();
});

const base = {
  code: 'WELCOME20',
  title: '20% off your first order',
  discount: { type: 'percent', percentBps: 2000, maxDiscountMinor: 10_000 },
  minOrderMinor: 30_000,
  startsAt: '2026-10-13T00:00:00.000Z',
  endsAt: '2026-10-31T00:00:00.000Z',
  usageLimitTotal: 500,
  usageLimitPerCustomer: 1,
};

interface CouponBody {
  id: string;
  approvalStatus: string;
  displayStatus: string;
  approvalRoute: string;
  reviewReasons: string[];
  branchIds: string[];
  code?: string;
}

const create = (body: object) => call<CouponBody & { code: string; errors?: Record<string, string[]> }>(ctx, 'POST', '/partner/coupons', { token: owner.token, body });

describe('coupons', () => {
  it('auto-approves low-risk coupons and schedules them', async () => {
    const res = await create(base);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ approvalRoute: 'auto', approvalStatus: 'approved', displayStatus: 'scheduled', reviewReasons: [] });
    ctx.clock.set('2026-10-14T00:00:00.000Z');
    const later = await call<CouponBody>(ctx, 'GET', `/partner/coupons/${res.body.id}`, { token: owner.token });
    expect(later.body.displayStatus).toBe('active');
  });

  it('rejects invalid coupons', async () => {
    const cases: [object, string][] = [
      [{ ...base, endsAt: '2026-10-12T00:00:00.000Z' }, 'endsAt'],
      [{ ...base, startsAt: '2026-10-20T00:00:00.000Z', endsAt: '2026-10-19T00:00:00.000Z' }, 'endsAt'],
      [{ ...base, discount: { type: 'flat', amountMinor: 30_000 } }, 'discount.amountMinor'],
    ];
    for (const [body, field] of cases) {
      const res = await create(body);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('coupon.invalid');
      expect(Object.keys(res.body.errors ?? {})).toContain(field);
    }
    expect((await create({ ...base, minOrderMinor: -1 })).status).toBe(422);
    expect((await create({ ...base, discount: { type: 'percent', percentBps: -5, maxDiscountMinor: null } })).status).toBe(422);
    expect((await create({ ...base, code: 'no spaces!' })).status).toBe(422);
  });

  it('refuses a duplicate live code but allows reuse after cancelling', async () => {
    const first = await create(base);
    const duplicate = await create({ ...base, code: 'welcome20' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('coupon.duplicate_code');
    await call(ctx, 'POST', `/partner/coupons/${first.body.id}/cancel`, { token: owner.token });
    expect((await create(base)).status).toBe(200);
  });

  it('holds high-discount coupons for an administrator, whatever the owner sends', async () => {
    const res = await create({
      ...base,
      code: 'MEGA60',
      discount: { type: 'percent', percentBps: 6000, maxDiscountMinor: null },
      approvalStatus: 'approved',
      approvalRoute: 'auto',
    });
    expect(res.status).toBe(200);
    expect(res.body.approvalStatus).toBe('pending_approval');
    expect(res.body.reviewReasons).toEqual(['percent_above_auto_limit', 'percent_without_cap']);

    // The owner cannot approve: their token is not an admin token.
    expect((await call(ctx, 'POST', `/admin/coupons/${res.body.id}/approve`, { token: owner.token })).status).toBe(401);
    // PATCHing approval fields is ignored.
    const patched = await call<CouponBody>(ctx, 'PATCH', `/partner/coupons/${res.body.id}`, {
      token: owner.token,
      body: { title: 'Mega sale', approvalStatus: 'approved' },
    });
    expect(patched.body.approvalStatus).toBe('pending_approval');

    const finance = await signInAdmin(ctx, 'finance');
    expect((await call(ctx, 'POST', `/admin/coupons/${res.body.id}/approve`, { token: finance.token })).status).toBe(403);
    const ops = await signInAdmin(ctx, 'operations');
    const pending = await call<{ items: { id: string; businessLegalName: string }[] }>(ctx, 'GET', '/admin/coupons', { token: ops.token });
    expect(pending.body.items.map((c) => c.id)).toEqual([res.body.id]);
    const approved = await call<CouponBody>(ctx, 'POST', `/admin/coupons/${res.body.id}/approve`, { token: ops.token });
    expect(approved.body.approvalStatus).toBe('approved');
    expect((await call(ctx, 'POST', `/admin/coupons/${res.body.id}/approve`, { token: ops.token })).status).toBe(409);
  });

  it('records the administrator’s reason on rejection', async () => {
    const res = await create({ ...base, code: 'BIGFLAT', discount: { type: 'flat', amountMinor: 20_000 }, minOrderMinor: 30_000 });
    expect(res.body.approvalStatus).toBe('pending_approval');
    const ops = await signInAdmin(ctx, 'operations');
    const rejected = await call<CouponBody & { rejectionReason: string }>(ctx, 'POST', `/admin/coupons/${res.body.id}/reject`, {
      token: ops.token,
      body: { reason: 'Discount too high for this menu' },
    });
    expect(rejected.body).toMatchObject({ approvalStatus: 'rejected', displayStatus: 'rejected', rejectionReason: 'Discount too high for this menu' });
  });

  it('sends an edited coupon back for review when it crosses a limit', async () => {
    const res = await create(base);
    expect(res.body.approvalStatus).toBe('approved');
    const edited = await call<CouponBody>(ctx, 'PATCH', `/partner/coupons/${res.body.id}`, {
      token: owner.token,
      body: { discount: { type: 'percent', percentBps: 5000, maxDiscountMinor: 10_000 } },
    });
    expect(edited.body.approvalStatus).toBe('pending_approval');
    expect(edited.body.reviewReasons).toContain('percent_above_auto_limit');
  });

  it('does not allow edits once a coupon has started', async () => {
    const res = await create({ ...base, startsAt: '2026-10-12T06:00:00.000Z' });
    const edit = await call<{ code: string }>(ctx, 'PATCH', `/partner/coupons/${res.body.id}`, { token: owner.token, body: { title: 'Changed title' } });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe('coupon.not_editable');
  });

  it('only accepts the owner’s own branches and items, and keeps coupons private', async () => {
    const intruder = await signInOwner(ctx);
    const theirs = await createActiveBranch(ctx, intruder.userId);
    expect((await create({ ...base, branchIds: [theirs.branch.id] })).status).toBe(404);

    const [category] = await ctx.db.insert(menuCategories).values({ branchId: theirs.branch.id, name: 'Mains' }).returning();
    const [item] = await ctx.db
      .insert(menuItems)
      .values({ branchId: theirs.branch.id, categoryId: category!.id, name: 'Paneer Tikka', priceMinor: 25_000, foodType: 'veg' })
      .returning();
    expect((await create({ ...base, menuItemIds: [item!.id] })).status).toBe(404);

    const mine = await create({ ...base, branchIds: [branchId] });
    expect(mine.body.branchIds).toEqual([branchId]);
    expect((await call(ctx, 'GET', `/partner/coupons/${mine.body.id}`, { token: intruder.token })).status).toBe(404);
  });

  it('previews validation and approval without saving', async () => {
    const preview = await call<{ valid: boolean; approvalRoute: string; exampleDiscountAtMinimum: { amountMinor: number } }>(
      ctx,
      'POST',
      '/partner/coupons/preview',
      { token: owner.token, body: base },
    );
    expect(preview.body).toMatchObject({ valid: true, approvalRoute: 'auto', exampleDiscountAtMinimum: { amountMinor: 6_000 } });
    const list = await call<{ items: unknown[] }>(ctx, 'GET', '/partner/coupons', { token: owner.token });
    expect(list.body.items).toHaveLength(0);
    const policy = await call<{ autoApproveMaxPercentBps: number }>(ctx, 'GET', '/partner/coupon-policy', { token: owner.token });
    expect(policy.body.autoApproveMaxPercentBps).toBe(3000);
  });
});
