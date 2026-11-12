import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { auditLogs, branches, documents, payoutAccounts } from '../src/db/schema';
import { call, createTestContext, signInAdmin, signInOwner, type TestContext } from './harness';
import { LICENCE_FIELDS, onboardBranch, uploadDocument } from './onboarding-helpers';

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof signInOwner>>;
let ops: { token: string; userId: string };
let support: { token: string; userId: string };

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await signInOwner(ctx);
  ops = await signInAdmin(ctx, 'operations');
  support = await signInAdmin(ctx, 'support');
});
afterAll(async () => {
  await ctx.close();
});

type Requirement = { type: string; state: string; nextAction: string | null };

async function requirement(branchId: string, type: string) {
  const res = await call<{ requirements: Requirement[] }>(ctx, 'GET', `/partner/branches/${branchId}/documents`, { token: owner.token });
  return res.body.requirements.find((r) => r.type === type)!;
}

describe('admin access control', () => {
  it('refuses owners and missing tokens on admin routes', async () => {
    const { licenceId, branchId } = await onboardBranch(ctx, owner, 'Access Test');
    expect((await call(ctx, 'GET', '/admin/documents', { token: owner.token })).status).toBe(401);
    expect((await call(ctx, 'POST', `/admin/documents/${licenceId}/approve`, { token: owner.token })).status).toBe(401);
    expect((await call(ctx, 'POST', `/admin/branches/${branchId}/approve`, { token: owner.token, body: { commissionBps: 1800, note: null } })).status).toBe(401);
    expect((await call(ctx, 'POST', `/admin/documents/${licenceId}/approve`)).status).toBe(401);
    const [doc] = await ctx.db.select().from(documents).where(eq(documents.id, licenceId));
    expect(doc?.status).toBe('pending_review');
  });

  it('refuses admins without the operations role', async () => {
    const { licenceId } = await onboardBranch(ctx, owner, 'Role Test');
    const res = await call<{ code: string }>(ctx, 'POST', `/admin/documents/${licenceId}/approve`, { token: support.token });
    expect(res.status).toBe(403);
    const [doc] = await ctx.db.select().from(documents).where(eq(documents.id, licenceId));
    expect(doc?.status).toBe('pending_review');
  });
});

describe('licence review', () => {
  it('lists pending documents for review and serves the file to operations', async () => {
    const { licenceId } = await onboardBranch(ctx, owner, 'Queue Test');
    const list = await call<{ items: { id: string; branchName: string; businessLegalName: string }[] }>(ctx, 'GET', '/admin/documents?status=pending_review&limit=100', {
      token: ops.token,
    });
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: licenceId, branchName: 'Queue Test' })]));
    const file = await ctx.app.inject({ method: 'GET', url: `/api/v1/admin/documents/${licenceId}/file`, headers: { authorization: `Bearer ${ops.token}` } });
    expect(file.statusCode).toBe(200);
  });

  it('pages through the review queue with a cursor', async () => {
    const page1 = await call<{ items: { id: string }[]; nextCursor: string | null }>(ctx, 'GET', '/admin/documents?limit=2', { token: ops.token });
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.nextCursor).not.toBeNull();
    const page2 = await call<{ items: { id: string }[] }>(ctx, 'GET', `/admin/documents?limit=2&cursor=${page1.body.nextCursor}`, { token: ops.token });
    const ids = new Set(page1.body.items.map((i) => i.id));
    expect(page2.body.items.some((i) => ids.has(i.id))).toBe(false);
  });

  it('rejection shows the reason, blocks submission, and resubmission goes back to review', async () => {
    const { branchId, licenceId } = await onboardBranch(ctx, owner, 'Reject Test');
    const noReason = await call(ctx, 'POST', `/admin/documents/${licenceId}/reject`, { token: ops.token, body: { reason: '' } });
    expect(noReason.status).toBe(422);
    const rejected = await call<{ status: string; rejectionReason: string }>(ctx, 'POST', `/admin/documents/${licenceId}/reject`, {
      token: ops.token,
      body: { reason: 'The licence image is unreadable.' },
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe('rejected');

    const req = await requirement(branchId, 'fssai_license');
    expect(req.state).toBe('resubmission_required');
    expect(req.nextAction).toContain('unreadable');

    const submit = await call<{ code: string; errors: Record<string, string[]> }>(ctx, 'POST', `/partner/branches/${branchId}/submit`, { token: owner.token });
    expect(submit.status).toBe(422);
    expect(submit.body.code).toBe('branch.onboarding_incomplete');
    expect(submit.body.errors.licence).toBeDefined();

    const again = await uploadDocument<{ id: string; status: string }>(ctx, owner.token, branchId, LICENCE_FIELDS);
    expect(again.status).toBe(201);
    expect(again.body.status).toBe('pending_review');
    expect((await requirement(branchId, 'fssai_license')).state).toBe('pending_review');
    expect((await call(ctx, 'POST', `/partner/branches/${branchId}/submit`, { token: owner.token })).status).toBe(200);

    const actions = (await ctx.db.select().from(auditLogs).where(eq(auditLogs.branchId, branchId))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['document.uploaded', 'document.rejected']));
  });

  it('cannot approve a document twice or approve an expired one', async () => {
    const { licenceId } = await onboardBranch(ctx, owner, 'Twice Test');
    expect((await call(ctx, 'POST', `/admin/documents/${licenceId}/approve`, { token: ops.token })).status).toBe(200);
    const again = await call<{ code: string }>(ctx, 'POST', `/admin/documents/${licenceId}/approve`, { token: ops.token });
    expect(again.status).toBe(422);
    expect(again.body.code).toBe('document.not_reviewable');

    const { licenceId: second } = await onboardBranch(ctx, owner, 'Expiry Test');
    // The licence lapsed while waiting in the queue.
    await ctx.db.update(documents).set({ expiresOn: '2026-10-01' }).where(eq(documents.id, second));
    const expired = await call<{ code: string }>(ctx, 'POST', `/admin/documents/${second}/approve`, { token: ops.token });
    expect(expired.status).toBe(422);
    expect(expired.body.code).toBe('document.not_reviewable');
  });
});

describe('branch approval', () => {
  it('cannot approve until the licence, bank proof, verified bank account and declaration are in place', async () => {
    const { branchId, licenceId, bankProofId } = await onboardBranch(ctx, owner, 'Approval Test');
    const draftApprove = await call<{ code: string }>(ctx, 'POST', `/admin/branches/${branchId}/approve`, {
      token: ops.token,
      body: { commissionBps: 1800, note: null },
    });
    expect(draftApprove.status).toBe(422);
    expect(draftApprove.body.code).toBe('branch.invalid_transition');

    expect((await call(ctx, 'POST', `/partner/branches/${branchId}/submit`, { token: owner.token })).status).toBe(200);

    const listed = await call<{ items: { id: string; approvalBlockers: string[] }[] }>(ctx, 'GET', '/admin/branches?status=pending_review&limit=100', { token: ops.token });
    const entry = listed.body.items.find((b) => b.id === branchId);
    expect(entry?.approvalBlockers.length).toBeGreaterThan(0);

    const blocked = await call<{ code: string; errors: { approval: string[] } }>(ctx, 'POST', `/admin/branches/${branchId}/approve`, {
      token: ops.token,
      body: { commissionBps: 1800, note: null },
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe('branch.documents_incomplete');
    expect(blocked.body.errors.approval.join(' ')).toContain('FSSAI licence');

    await call(ctx, 'POST', `/admin/documents/${licenceId}/approve`, { token: ops.token });
    await call(ctx, 'POST', `/admin/documents/${bankProofId}/approve`, { token: ops.token });
    const stillBlocked = await call<{ errors: { approval: string[] } }>(ctx, 'POST', `/admin/branches/${branchId}/approve`, {
      token: ops.token,
      body: { commissionBps: 1800, note: null },
    });
    expect(stillBlocked.status).toBe(422);
    expect(stillBlocked.body.errors.approval).toEqual(['Payout bank account is not verified yet.']);
    const [branchBefore] = await ctx.db.select().from(branches).where(eq(branches.id, branchId));
    expect(branchBefore?.status).toBe('pending_review');

    await ctx.db.update(payoutAccounts).set({ status: 'verified', verifiedAt: ctx.clock.now, verifiedVia: 'finance_review' }).where(eq(payoutAccounts.branchId, branchId));
    const approved = await call<{ status: string }>(ctx, 'POST', `/admin/branches/${branchId}/approve`, {
      token: ops.token,
      body: { commissionBps: 1750, note: 'All good' },
    });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('active');
    const [branch] = await ctx.db.select().from(branches).where(eq(branches.id, branchId));
    expect(branch).toMatchObject({ status: 'active', commissionBps: 1750, approvedBy: ops.userId, isAcceptingOrders: false });

    // Suspend and reinstate.
    const suspended = await call<{ status: string }>(ctx, 'POST', `/admin/branches/${branchId}/suspend`, {
      token: ops.token,
      body: { reason: 'Repeated veg/non-veg complaints under investigation.' },
    });
    expect(suspended.body.status).toBe('suspended');
    const owned = await call<{ branch: { statusReason: string; availability: { state: string } } }>(ctx, 'GET', `/partner/branches/${branchId}`, { token: owner.token });
    expect(owned.body.branch.statusReason).toContain('complaints');
    expect(owned.body.branch.availability.state).toBe('not_active');
    const reinstated = await call<{ status: string }>(ctx, 'POST', `/admin/branches/${branchId}/reinstate`, { token: ops.token });
    expect(reinstated.body.status).toBe('active');
  });

  it('rejects a branch with a reason; the owner can fix and resubmit', async () => {
    const { branchId } = await onboardBranch(ctx, owner, 'Branch Reject Test');
    await call(ctx, 'POST', `/partner/branches/${branchId}/submit`, { token: owner.token });
    const rejected = await call<{ status: string }>(ctx, 'POST', `/admin/branches/${branchId}/reject`, {
      token: ops.token,
      body: { reason: 'Address does not match the licence.' },
    });
    expect(rejected.body.status).toBe('rejected');
    const rename = await call(ctx, 'PATCH', `/partner/branches/${branchId}`, {
      token: owner.token,
      body: { address: { line1: '14 MG Road', line2: null, locality: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', postalCode: '560038' } },
    });
    expect(rename.status).toBe(200);
    const resubmit = await call<{ branch: { status: string } }>(ctx, 'POST', `/partner/branches/${branchId}/submit`, { token: owner.token });
    expect(resubmit.body.branch.status).toBe('pending_review');
  });
});
