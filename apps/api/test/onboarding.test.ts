import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditLogs, branches } from '../src/db/schema';
import { call, createActiveBranch, createTestContext, signInOwner, type TestContext } from './harness';
import { EVERY_DAY_SPLIT_HOURS, onboardBranch } from './onboarding-helpers';

let ctx: TestContext;
beforeAll(async () => {
  // 2026-10-12 06:30 UTC = 12:00 IST.
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});

type Detail = {
  branch: { id: string; status: string; name: string; availability: { state: string } };
  onboarding: { canSubmit: boolean; steps: { step: string; complete: boolean; hint: string | null }[] };
};

describe('owner registration and branch management', () => {
  it('registers a business and branch end to end, saving step by step, then submits', async () => {
    const owner = await signInOwner(ctx);
    const { branchId } = await onboardBranch(ctx, owner);

    const detail = await call<Detail>(ctx, 'GET', `/partner/branches/${branchId}`, { token: owner.token });
    expect(detail.status).toBe(200);
    expect(detail.body.onboarding.steps.every((s) => s.complete)).toBe(true);
    expect(detail.body.onboarding.canSubmit).toBe(true);
    expect(detail.body.branch.availability.state).toBe('not_active');

    const submitted = await call<Detail>(ctx, 'POST', `/partner/branches/${branchId}/submit`, { token: owner.token });
    expect(submitted.status).toBe(200);
    expect(submitted.body.branch.status).toBe('pending_review');

    const me = await call<{ business: { legalName: string }; branches: { id: string; role: string }[] }>(ctx, 'GET', '/partner/me', {
      token: owner.token,
    });
    expect(me.body.business?.legalName).toBe('Masala Kitchens LLP');
    expect(me.body.branches).toEqual([expect.objectContaining({ id: branchId, role: 'owner', status: 'pending_review' })]);

    const audits = await ctx.db.select().from(auditLogs).where(eq(auditLogs.branchId, branchId));
    expect(audits.map((a) => a.action)).toEqual(expect.arrayContaining(['branch.created', 'branch.submitted', 'declaration.accepted']));
  });

  it('refuses to submit while steps are incomplete and says which', async () => {
    const owner = await signInOwner(ctx);
    await call(ctx, 'PUT', '/partner/business', {
      token: owner.token,
      body: { displayName: 'Dosa Co', legalName: 'Dosa Co', entityType: 'individual', gstin: null },
    });
    const created = await call<Detail>(ctx, 'POST', '/partner/branches', { token: owner.token, body: { name: 'Dosa Co' } });
    const branchId = created.body.branch.id;
    expect(created.body.onboarding.canSubmit).toBe(false);
    const res = await call<{ code: string; errors: Record<string, string[]> }>(ctx, 'POST', `/partner/branches/${branchId}/submit`, {
      token: owner.token,
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('branch.onboarding_incomplete');
    expect(Object.keys(res.body.errors)).toEqual(expect.arrayContaining(['licence', 'bank', 'declaration', 'hours', 'location']));
  });

  it('lets one owner run several branches with the same name in different places', async () => {
    const owner = await signInOwner(ctx);
    await onboardBranch(ctx, owner, 'Biryani House');
    const second = await call<Detail>(ctx, 'POST', '/partner/branches', { token: owner.token, body: { name: 'Biryani House' } });
    expect(second.status).toBe(201);
    const list = await call<{ items: { name: string }[] }>(ctx, 'GET', '/partner/branches', { token: owner.token });
    expect(list.body.items).toHaveLength(2);
    expect(list.body.items.every((b) => b.name === 'Biryani House')).toBe(true);
  });

  it('locks the name, address and location after submission but allows operational edits', async () => {
    const owner = await signInOwner(ctx);
    const { branchId } = await onboardBranch(ctx, owner);
    await call(ctx, 'POST', `/partner/branches/${branchId}/submit`, { token: owner.token });
    const rename = await call<{ code: string }>(ctx, 'PATCH', `/partner/branches/${branchId}`, {
      token: owner.token,
      body: { name: 'New Name' },
    });
    expect(rename.status).toBe(422);
    expect(rename.body.code).toBe('branch.invalid_transition');
    const prep = await call<Detail>(ctx, 'PATCH', `/partner/branches/${branchId}`, {
      token: owner.token,
      body: { avgPrepMinutes: 30, minimumOrderMinor: 15_000 },
    });
    expect(prep.status).toBe(200);
  });

  it('rejects a location outside India', async () => {
    const owner = await signInOwner(ctx);
    const { branchId } = await onboardBranch(ctx, owner);
    const res = await call(ctx, 'PATCH', `/partner/branches/${branchId}`, {
      token: owner.token,
      body: { location: { lat: 51.5, lng: -0.12, source: 'manual' } },
    });
    expect(res.status).toBe(422);
  });
});

describe('business profile', () => {
  const BUSINESS = { displayName: 'Tiffin Box', legalName: 'Tiffin Box Foods', entityType: 'partnership', gstin: null } as const;

  it('needs a signed-in partner', async () => {
    expect((await call(ctx, 'GET', '/partner/business')).status).toBe(401);
    expect((await call(ctx, 'PATCH', '/partner/business', { body: { displayName: 'X Foods' } })).status).toBe(401);
  });

  it('is 404 until the business is created; PATCH does not create one', async () => {
    const owner = await signInOwner(ctx);
    expect((await call(ctx, 'GET', '/partner/business', { token: owner.token })).status).toBe(404);
    const patched = await call(ctx, 'PATCH', '/partner/business', { token: owner.token, body: { displayName: 'Ghost' } });
    expect(patched.status).toBe(404);
    expect((await call(ctx, 'GET', '/partner/business', { token: owner.token })).status).toBe(404);
  });

  it('returns the business and edits only the fields sent, keeping PUT working', async () => {
    const owner = await signInOwner(ctx);
    const created = await call<{ id: string }>(ctx, 'PUT', '/partner/business', { token: owner.token, body: BUSINESS });
    expect(created.status).toBe(200);

    const got = await call(ctx, 'GET', '/partner/business', { token: owner.token });
    expect(got.status).toBe(200);
    expect(got.body).toEqual({ id: created.body.id, ...BUSINESS });

    const patched = await call(ctx, 'PATCH', '/partner/business', {
      token: owner.token,
      body: { displayName: 'Tiffin Box Express', gstin: '27aapfu0939f1zv' },
    });
    expect(patched.status).toBe(200);
    expect(patched.body).toEqual({ ...BUSINESS, id: created.body.id, displayName: 'Tiffin Box Express', gstin: '27AAPFU0939F1ZV' });
    expect((await call(ctx, 'GET', '/partner/business', { token: owner.token })).body).toEqual(patched.body);

    const bad = await call(ctx, 'PATCH', '/partner/business', { token: owner.token, body: { gstin: 'NOT-A-GSTIN' } });
    expect(bad.status).toBe(422);

    const audits = await ctx.db.select().from(auditLogs).where(eq(auditLogs.entityId, created.body.id));
    expect(audits.map((a) => a.action)).toEqual(['business.created', 'business.updated']);
    expect(audits[1]?.metadata).toEqual({ fields: ['displayName', 'gstin'] });

    const replaced = await call(ctx, 'PUT', '/partner/business', { token: owner.token, body: BUSINESS });
    expect(replaced.body).toEqual({ id: created.body.id, ...BUSINESS });
  });

  it("only ever reads or edits the caller's own business", async () => {
    const alice = await signInOwner(ctx);
    const bob = await signInOwner(ctx);
    const a = await call<{ id: string }>(ctx, 'PUT', '/partner/business', { token: alice.token, body: BUSINESS });
    const b = await call<{ id: string }>(ctx, 'PUT', '/partner/business', {
      token: bob.token,
      body: { ...BUSINESS, displayName: 'Bob Foods' },
    });

    await call(ctx, 'PATCH', '/partner/business', { token: bob.token, body: { legalName: 'Bob Foods Pvt' } });
    const aliceView = await call<{ id: string; legalName: string }>(ctx, 'GET', '/partner/business', { token: alice.token });
    const bobView = await call<{ id: string; legalName: string }>(ctx, 'GET', '/partner/business', { token: bob.token });
    expect(aliceView.body).toMatchObject({ id: a.body.id, legalName: BUSINESS.legalName });
    expect(bobView.body).toMatchObject({ id: b.body.id, legalName: 'Bob Foods Pvt' });
  });
});

describe('owner isolation', () => {
  it("returns 404 for another owner's branch, hours, availability and edits", async () => {
    const alice = await signInOwner(ctx);
    const bob = await signInOwner(ctx);
    const { branchId } = await onboardBranch(ctx, alice);
    await call(ctx, 'PUT', '/partner/business', {
      token: bob.token,
      body: { displayName: 'Bob', legalName: 'Bob Foods', entityType: 'individual', gstin: null },
    });
    for (const [method, url, body] of [
      ['GET', `/partner/branches/${branchId}`, undefined],
      ['PATCH', `/partner/branches/${branchId}`, { description: 'hijack' }],
      ['GET', `/partner/branches/${branchId}/hours`, undefined],
      ['PUT', `/partner/branches/${branchId}/hours`, { sessions: EVERY_DAY_SPLIT_HOURS }],
      ['GET', `/partner/branches/${branchId}/availability`, undefined],
      ['PATCH', `/partner/branches/${branchId}/intake`, { isAcceptingOrders: true }],
      ['POST', `/partner/branches/${branchId}/submit`, undefined],
    ] as const) {
      const res = await call(ctx, method, url, { token: bob.token, body });
      expect(res.status, `${method} ${url}`).toBe(404);
    }
    const list = await call<{ items: unknown[] }>(ctx, 'GET', '/partner/branches', { token: bob.token });
    expect(list.body.items).toHaveLength(0);
  });
});

describe('hours, breaks and availability', () => {
  // One owner for this block: the OTP endpoint is rate-limited per client (10/min).
  let owner: Awaited<ReturnType<typeof signInOwner>>;
  beforeAll(async () => {
    owner = await signInOwner(ctx);
  });

  it('validates sessions: overlaps are refused, split days and overnight sessions are allowed', async () => {
    const { branchId } = await onboardBranch(ctx, owner);
    const overlap = await call<{ code: string; detail: string }>(ctx, 'PUT', `/partner/branches/${branchId}/hours`, {
      token: owner.token,
      body: {
        sessions: [
          { dayOfWeek: 0, opensAt: '08:00', closesAt: '16:00' },
          { dayOfWeek: 0, opensAt: '15:00', closesAt: '20:00' },
        ],
      },
    });
    expect(overlap.status).toBe(422);
    expect(overlap.body.detail).toContain('Monday');
    const ok = await call<{ sessions: unknown[] }>(ctx, 'PUT', `/partner/branches/${branchId}/hours`, {
      token: owner.token,
      body: {
        sessions: [
          { dayOfWeek: 4, opensAt: '08:00', closesAt: '16:00' },
          { dayOfWeek: 4, opensAt: '17:00', closesAt: '02:00' },
        ],
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.sessions).toHaveLength(2);
  });

  it('is open in a session, on break between sessions and closed after the last one', async () => {
    const { branch } = await createActiveBranch(ctx, owner.userId);
    const state = async (utc: string) => {
      ctx.clock.set(utc);
      const res = await call<{ state: string; acceptingOrders: boolean; nextOpenAt: string | null }>(
        ctx,
        'GET',
        `/partner/branches/${branch.id}/availability`,
        { token: owner.token },
      );
      return res.body;
    };
    // IST = UTC+05:30. Sessions every day 08:00–16:00 and 17:00–23:00 IST.
    expect((await state('2026-10-13T06:30:00Z')).state).toBe('open'); // 12:00 IST
    const onBreak = await state('2026-10-13T11:00:00Z'); // 16:30 IST
    expect(onBreak.state).toBe('on_break');
    expect(onBreak.acceptingOrders).toBe(false);
    expect(onBreak.nextOpenAt).toBe('2026-10-13T11:30:00.000Z'); // 17:00 IST
    expect((await state('2026-10-13T18:00:00Z')).state).toBe('closed_for_day'); // 23:30 IST
    expect((await state('2026-10-13T01:00:00Z')).state).toBe('not_open_yet'); // 06:30 IST
  });

  it("changing one branch's hours does not affect another branch", async () => {
    const { branch: a } = await createActiveBranch(ctx, owner.userId, { name: 'A' });
    const { branch: b } = await createActiveBranch(ctx, owner.userId, { name: 'B' });
    ctx.clock.set('2026-10-13T06:30:00Z'); // Tuesday 12:00 IST
    const put = await call(ctx, 'PUT', `/partner/branches/${a.id}/hours`, {
      token: owner.token,
      body: { sessions: [{ dayOfWeek: 6, opensAt: '18:00', closesAt: '22:00' }] },
    });
    expect(put.status).toBe(200);
    const availA = await call<{ state: string }>(ctx, 'GET', `/partner/branches/${a.id}/availability`, { token: owner.token });
    const availB = await call<{ state: string }>(ctx, 'GET', `/partner/branches/${b.id}/availability`, { token: owner.token });
    expect(availA.body.state).not.toBe('open');
    expect(availB.body.state).toBe('open');
    const hoursB = await call<{ sessions: unknown[] }>(ctx, 'GET', `/partner/branches/${b.id}/hours`, { token: owner.token });
    expect(hoursB.body.sessions).toHaveLength(14);
  });

  it('holidays close the branch for the day; past dates and duplicates are refused', async () => {
    const { branch } = await createActiveBranch(ctx, owner.userId);
    ctx.clock.set('2026-10-13T06:30:00Z');
    const added = await call<{ id: string }>(ctx, 'POST', `/partner/branches/${branch.id}/closures`, {
      token: owner.token,
      body: { date: '2026-10-13', note: 'Diwali' },
    });
    expect(added.status).toBe(201);
    const avail = await call<{ state: string }>(ctx, 'GET', `/partner/branches/${branch.id}/availability`, { token: owner.token });
    expect(avail.body.state).toBe('holiday');
    expect((await call(ctx, 'POST', `/partner/branches/${branch.id}/closures`, { token: owner.token, body: { date: '2026-10-13', note: null } })).status).toBe(409);
    expect((await call(ctx, 'POST', `/partner/branches/${branch.id}/closures`, { token: owner.token, body: { date: '2026-10-01', note: null } })).status).toBe(422);
    const removed = await call(ctx, 'DELETE', `/partner/branches/${branch.id}/closures/${added.body.id}`, { token: owner.token });
    expect(removed.status).toBe(200);
    const after = await call<{ state: string }>(ctx, 'GET', `/partner/branches/${branch.id}/availability`, { token: owner.token });
    expect(after.body.state).toBe('open');
  });

  it('only active branches can go online; pausing and going offline stop intake', async () => {
    const { branchId } = await onboardBranch(ctx, owner);
    const draftOnline = await call<{ code: string }>(ctx, 'PATCH', `/partner/branches/${branchId}/intake`, {
      token: owner.token,
      body: { isAcceptingOrders: true },
    });
    expect(draftOnline.status).toBe(422);
    expect(draftOnline.body.code).toBe('branch.not_active');
    const [stillOffline] = await ctx.db.select().from(branches).where(eq(branches.id, branchId));
    expect(stillOffline?.isAcceptingOrders).toBe(false);

    const { branch } = await createActiveBranch(ctx, owner.userId);
    ctx.clock.set('2026-10-13T06:30:00Z');
    const paused = await call<{ state: string; pausedUntil: string }>(ctx, 'PATCH', `/partner/branches/${branch.id}/intake`, {
      token: owner.token,
      body: { pauseMinutes: 30, pauseReason: 'Kitchen rush' },
    });
    expect(paused.body.state).toBe('paused');
    expect(paused.body.pausedUntil).toBe('2026-10-13T07:00:00.000Z');
    ctx.clock.advance(31 * 60_000);
    const resumed = await call<{ state: string }>(ctx, 'GET', `/partner/branches/${branch.id}/availability`, { token: owner.token });
    expect(resumed.body.state).toBe('open');
    const offline = await call<{ state: string }>(ctx, 'PATCH', `/partner/branches/${branch.id}/intake`, {
      token: owner.token,
      body: { isAcceptingOrders: false },
    });
    expect(offline.body.state).toBe('offline');
  });

  it('accepts PUT for intake with the same rules as PATCH (app compatibility)', async () => {
    const { branchId: draftId } = await onboardBranch(ctx, owner);
    const draftOnline = await call<{ code: string }>(ctx, 'PUT', `/partner/branches/${draftId}/intake`, {
      token: owner.token,
      body: { isAcceptingOrders: true },
    });
    expect(draftOnline.status).toBe(422);
    expect(draftOnline.body.code).toBe('branch.not_active');

    const { branch } = await createActiveBranch(ctx, owner.userId);
    ctx.clock.set('2026-10-13T06:30:00Z');
    const url = `/partner/branches/${branch.id}/intake`;
    const offline = await call<{ state: string }>(ctx, 'PUT', url, { token: owner.token, body: { isAcceptingOrders: false } });
    expect(offline.status).toBe(200);
    expect(offline.body.state).toBe('offline');
    const online = await call<{ state: string }>(ctx, 'PUT', url, { token: owner.token, body: { isAcceptingOrders: true } });
    expect(online.body.state).toBe('open');
    expect((await call(ctx, 'PUT', url, { token: owner.token, body: { pauseMinutes: 5 } })).status).toBe(422);

    const intruder = await signInOwner(ctx);
    await createActiveBranch(ctx, intruder.userId, { name: 'Elsewhere' });
    expect((await call(ctx, 'PUT', url, { token: intruder.token, body: { isAcceptingOrders: false } })).status).toBe(404);
    expect((await call(ctx, 'PUT', url, { body: { isAcceptingOrders: false } })).status).toBe(401);
    expect((await call<{ state: string }>(ctx, 'GET', `/partner/branches/${branch.id}/availability`, { token: owner.token })).body.state).toBe('open');
  });
});
