import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { declarationAcceptances, documents } from '../src/db/schema';
import { call, createTestContext, signInOwner, type TestContext } from './harness';
import { LICENCE_FIELDS, onboardBranch, PNG_BYTES, TEXT_BYTES, uploadDocument } from './onboarding-helpers';

let ctx: TestContext;
let alice: Awaited<ReturnType<typeof signInOwner>>;
let bob: Awaited<ReturnType<typeof signInOwner>>;
let aliceBranch: { branchId: string; licenceId: string; bankProofId: string };

beforeAll(async () => {
  ctx = await createTestContext();
  alice = await signInOwner(ctx);
  bob = await signInOwner(ctx);
  aliceBranch = await onboardBranch(ctx, alice);
  await call(ctx, 'PUT', '/partner/business', {
    token: bob.token,
    body: { displayName: 'Bob', legalName: 'Bob Foods', entityType: 'individual', gstin: null },
  });
});
afterAll(async () => {
  await ctx.close();
});

type Requirements = {
  requirements: { type: string; required: boolean; state: string; nextAction: string | null; current: { id: string } | null }[];
  history: { id: string; status: string }[];
};

describe('document uploads', () => {
  it('stores an uploaded licence as pending review, never approved', async () => {
    const res = await call<Requirements>(ctx, 'GET', `/partner/branches/${aliceBranch.branchId}/documents`, { token: alice.token });
    expect(res.status).toBe(200);
    const licence = res.body.requirements.find((r) => r.type === 'fssai_license');
    expect(licence).toMatchObject({ required: true, state: 'pending_review' });
    const [row] = await ctx.db.select().from(documents).where(eq(documents.id, aliceBranch.licenceId));
    expect(row?.status).toBe('pending_review');
    expect(row?.reviewedAt).toBeNull();
    expect(row?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ctx.storage.files.has(`private/${row!.storageKey}`)).toBe(true);
  });

  it('checks the real file type, the licence number and the expiry date', async () => {
    const { branchId } = aliceBranch;
    const text = await uploadDocument<{ code: string }>(ctx, alice.token, branchId, LICENCE_FIELDS, TEXT_BYTES);
    expect(text.status).toBe(422);
    expect(text.body.code).toBe('document.invalid_file');
    const badNumber = await uploadDocument<{ errors: Record<string, string[]> }>(ctx, alice.token, branchId, {
      ...LICENCE_FIELDS,
      documentNumber: '1234',
    });
    expect(badNumber.status).toBe(422);
    expect(badNumber.body.errors.documentNumber).toBeDefined();
    const expired = await uploadDocument<{ errors: Record<string, string[]> }>(ctx, alice.token, branchId, {
      ...LICENCE_FIELDS,
      expiresOn: '2026-01-01',
    });
    expect(expired.status).toBe(422);
    expect(expired.body.errors.expiresOn).toBeDefined();
    const missingFile = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/partner/branches/${branchId}/documents`,
      headers: { authorization: `Bearer ${alice.token}`, 'content-type': 'application/json' },
      payload: JSON.stringify(LICENCE_FIELDS),
    });
    expect(missingFile.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('accepts an FSSAI licence without an expiry date and stores it as null', async () => {
    const { expiresOn: _omitted, ...withoutExpiry } = LICENCE_FIELDS;
    // A separate branch, so Alice's main licence (used by later tests) is not superseded.
    const { branchId } = await onboardBranch(ctx, alice, 'No Expiry Kitchen');
    const res = await uploadDocument<{ id: string; expiresOn: string | null; status: string }>(
      ctx,
      alice.token,
      branchId,
      withoutExpiry,
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ expiresOn: null, status: 'pending_review' });
    const [row] = await ctx.db.select().from(documents).where(eq(documents.id, res.body.id));
    expect(row?.expiresOn).toBeNull();
  });

  it('still requires the 14-digit licence number when the expiry date is left out', async () => {
    const { expiresOn: _omitted, ...withoutExpiry } = LICENCE_FIELDS;
    const res = await uploadDocument<{ errors: Record<string, string[]> }>(ctx, alice.token, aliceBranch.branchId, {
      ...withoutExpiry,
      documentNumber: '1234',
    });
    expect(res.status).toBe(422);
    expect(res.body.errors.documentNumber).toBeDefined();
    expect(res.body.errors.expiresOn).toBeUndefined();
  });

  it('a new upload supersedes the previous one of the same type', async () => {
    const { branchId } = aliceBranch;
    const gst1 = await uploadDocument<{ id: string }>(ctx, alice.token, branchId, { type: 'gst_certificate' }, PNG_BYTES);
    const gst2 = await uploadDocument<{ id: string }>(ctx, alice.token, branchId, { type: 'gst_certificate' }, PNG_BYTES);
    expect(gst1.status).toBe(201);
    expect(gst2.status).toBe(201);
    const [first] = await ctx.db.select().from(documents).where(eq(documents.id, gst1.body.id));
    expect(first?.status).toBe('superseded');
    const res = await call<Requirements>(ctx, 'GET', `/partner/branches/${branchId}/documents`, { token: alice.token });
    const gst = res.body.requirements.find((r) => r.type === 'gst_certificate');
    expect(gst?.current?.id).toBe(gst2.body.id);
    expect(gst?.required).toBe(false);
  });

  it('lets the owner download their own file as an attachment', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/api/v1/partner/documents/${aliceBranch.licenceId}/file`,
      headers: { authorization: `Bearer ${alice.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    expect(res.body.startsWith('%PDF-')).toBe(true);
  });

  it("hides another owner's documents and files (404)", async () => {
    const list = await call(ctx, 'GET', `/partner/branches/${aliceBranch.branchId}/documents`, { token: bob.token });
    expect(list.status).toBe(404);
    const upload = await uploadDocument(ctx, bob.token, aliceBranch.branchId, LICENCE_FIELDS);
    expect(upload.status).toBe(404);
    const file = await call(ctx, 'GET', `/partner/documents/${aliceBranch.licenceId}/file`, { token: bob.token });
    expect(file.status).toBe(404);
    const noToken = await call(ctx, 'GET', `/partner/documents/${aliceBranch.licenceId}/file`);
    expect(noToken.status).toBe(401);
  });
});

describe('restaurant declaration', () => {
  it('serves a versioned draft that does not remove Swaadone responsibilities', async () => {
    const res = await call<{ version: string; textSha256: string; legalReviewStatus: string; clauses: { heading: string; body: string }[] }>(
      ctx,
      'GET',
      '/partner/declaration',
      { token: alice.token },
    );
    expect(res.status).toBe(200);
    expect(res.body.legalReviewStatus).toBe('draft_pending_legal_review');
    expect(res.body.textSha256).toMatch(/^[0-9a-f]{64}$/);
    const text = res.body.clauses.map((c) => c.body).join(' ');
    expect(text).toContain('vegetarian biryani');
    expect(text).toContain('does not remove or limit any responsibility that Swaadone');
  });

  it('records acceptance with version, timestamp and user, and refuses a mismatched hash', async () => {
    const { branchId } = aliceBranch;
    const status = await call<{ acceptance: { version: string; acceptedAt: string; acceptedBy: string; isCurrentVersion: boolean } }>(
      ctx,
      'GET',
      `/partner/branches/${branchId}/declaration`,
      { token: alice.token },
    );
    expect(status.body.acceptance).toMatchObject({ acceptedBy: alice.userId, isCurrentVersion: true });
    const [row] = await ctx.db.select().from(declarationAcceptances).where(eq(declarationAcceptances.branchId, branchId));
    expect(row?.version).toBe(status.body.acceptance.version);
    expect(row?.acceptedAt).toBeInstanceOf(Date);
    expect(row?.textSha256).toMatch(/^[0-9a-f]{64}$/);

    const mismatch = await call<{ code: string }>(ctx, 'POST', `/partner/branches/${branchId}/declaration`, {
      token: alice.token,
      body: { version: status.body.acceptance.version, textSha256: '0'.repeat(64) },
    });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.code).toBe('declaration.outdated');

    // Accepting again is idempotent and keeps the original record.
    const declaration = await call<{ version: string; textSha256: string }>(ctx, 'GET', '/partner/declaration', { token: alice.token });
    const again = await call(ctx, 'POST', `/partner/branches/${branchId}/declaration`, { token: alice.token, body: declaration.body });
    expect(again.status).toBe(200);
    const rows = await ctx.db.select().from(declarationAcceptances).where(eq(declarationAcceptances.branchId, branchId));
    expect(rows).toHaveLength(1);

    const other = await call(ctx, 'POST', `/partner/branches/${branchId}/declaration`, { token: bob.token, body: declaration.body });
    expect(other.status).toBe(404);
  });
});
