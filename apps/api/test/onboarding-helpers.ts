import { randomUUID } from 'node:crypto';

import { payoutAccounts } from '../src/db/schema';
import { hmacHex } from '../src/lib/crypto';
import { call, type TestContext } from './harness';

/** Minimal bytes that pass magic-number sniffing. */
export const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
export const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
export const TEXT_BYTES = Buffer.from('this is not a document');

export function multipart(fields: Record<string, string>, file?: { name: string; data: Buffer; contentType: string }) {
  const boundary = `----hungerly${randomUUID().replace(/-/g, '')}`;
  const chunks: Buffer[] = [];
  for (const [key, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
  }
  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.data,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

export async function uploadDocument<T = { id: string; status: string }>(
  ctx: TestContext,
  token: string,
  branchId: string,
  fields: Record<string, string>,
  data: Buffer = PDF_BYTES,
) {
  const { payload, contentType } = multipart(fields, { name: 'doc.pdf', data, contentType: 'application/pdf' });
  const response = await ctx.app.inject({
    method: 'POST',
    url: `/api/v1/partner/branches/${branchId}/documents`,
    headers: { authorization: `Bearer ${token}`, 'content-type': contentType },
    payload,
  });
  return { status: response.statusCode, body: JSON.parse(response.body) as T };
}

export const LICENCE_FIELDS = { type: 'fssai_license', documentNumber: '12345678901234', expiresOn: '2028-03-31' };

export const EVERY_DAY_SPLIT_HOURS = [0, 1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
  { dayOfWeek, opensAt: '08:00', closesAt: '16:00' },
  { dayOfWeek, opensAt: '17:00', closesAt: '23:00' },
]);

/** Inserts a current payout account directly (the payout-account API belongs to another module). */
export async function addPayoutAccount(ctx: TestContext, branchId: string, userId: string, status: 'pending_verification' | 'verified' = 'pending_verification') {
  await ctx.db.insert(payoutAccounts).values({
    branchId,
    accountHolderName: 'Test Kitchens Pvt Ltd',
    accountLast4: '4321',
    ifsc: 'HDFC0001234',
    accountFingerprint: hmacHex(ctx.config.TOKEN_HASH_SECRET, `acct:${branchId}:${randomUUID()}`),
    status,
    verifiedAt: status === 'verified' ? ctx.clock.now : null,
    verifiedVia: status === 'verified' ? 'finance_review' : null,
    createdBy: userId,
  });
}

/**
 * Takes a new owner through every onboarding step over HTTP (except the bank account row,
 * which is inserted directly) and returns the draft branch id, ready to submit.
 */
export async function onboardBranch(ctx: TestContext, owner: { token: string; userId: string }, name = 'Masala Junction') {
  const token = owner.token;
  const business = await call(ctx, 'PUT', '/partner/business', {
    token,
    body: { displayName: 'Masala Kitchens', legalName: 'Masala Kitchens LLP', entityType: 'llp', gstin: null },
  });
  if (business.status !== 200) throw new Error(`business: ${JSON.stringify(business.body)}`);
  const created = await call<{ branch: { id: string } }>(ctx, 'POST', '/partner/branches', { token, body: { name } });
  if (created.status !== 201) throw new Error(`branch: ${JSON.stringify(created.body)}`);
  const branchId = created.body.branch.id;
  const patched = await call(ctx, 'PATCH', `/partner/branches/${branchId}`, {
    token,
    body: {
      cuisines: ['North Indian', 'Biryani'],
      foodType: 'mixed',
      phoneE164: '+919812345678',
      address: { line1: '12 MG Road', line2: null, locality: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', postalCode: '560038' },
      location: { lat: 12.9719, lng: 77.6412, source: 'map_pin' },
    },
  });
  if (patched.status !== 200) throw new Error(`patch: ${JSON.stringify(patched.body)}`);
  const hours = await call(ctx, 'PUT', `/partner/branches/${branchId}/hours`, { token, body: { sessions: EVERY_DAY_SPLIT_HOURS } });
  if (hours.status !== 200) throw new Error(`hours: ${JSON.stringify(hours.body)}`);
  const licence = await uploadDocument(ctx, token, branchId, LICENCE_FIELDS);
  if (licence.status !== 201) throw new Error(`licence: ${JSON.stringify(licence.body)}`);
  const bankProof = await uploadDocument(ctx, token, branchId, { type: 'bank_proof' });
  if (bankProof.status !== 201) throw new Error(`bank proof: ${JSON.stringify(bankProof.body)}`);
  await addPayoutAccount(ctx, branchId, owner.userId);
  const declaration = await call<{ version: string; textSha256: string }>(ctx, 'GET', '/partner/declaration', { token });
  const accepted = await call(ctx, 'POST', `/partner/branches/${branchId}/declaration`, {
    token,
    body: { version: declaration.body.version, textSha256: declaration.body.textSha256 },
  });
  if (accepted.status !== 201) throw new Error(`declaration: ${JSON.stringify(accepted.body)}`);
  return { branchId, licenceId: licence.body.id, bankProofId: bankProof.body.id };
}
