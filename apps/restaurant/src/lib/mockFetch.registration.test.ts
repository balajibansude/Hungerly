/**
 * Contract test for the registration wizard in prototype (mock) mode.
 *
 * Sends every request `(onboarding)/register.tsx` makes, in order, through the mock and
 * checks each response against the exact schema the screen passes to `api.request`. A
 * failure here is what the owner sees as "The app received data it does not understand".
 */

import {
  BranchDetailSchema,
  BusinessSchema,
  HoursResponseSchema,
  PartnerSessionSchema,
  PayoutAccountResponseSchema,
  paths,
} from '@hungerly/api-client';
import type { z } from 'zod';

import { mockFetch } from './mockFetch';

const BASE = 'http://prototype.swaadone.invalid/api/v1';

async function call<S extends z.ZodType>(method: string, path: string, body: unknown, schema: S) {
  const res = await mockFetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json();
  expect({ path, status: res.status }).toEqual({ path, status: 200 });
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`${method} ${path}: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data as z.infer<S>;
}

describe('registration wizard against the mock API', () => {
  it('accepts every step and returns schema-valid responses', async () => {
    // Step 1 — restaurant details
    const { branch } = await call('POST', paths.partner.branches, { name: 'Thali House' }, BranchDetailSchema);
    await call(
      'PATCH',
      paths.partner.branch(branch.id),
      { description: 'Home-style thalis.', cuisines: ['North Indian'], foodType: 'veg_only' },
      BranchDetailSchema,
    );

    // Step 2 — owner details
    await call('PATCH', paths.partner.me, { fullName: 'Asha Rao', email: 'asha@example.com' }, PartnerSessionSchema);

    // Step 3 — location
    await call(
      'PATCH',
      paths.partner.branch(branch.id),
      {
        address: {
          line1: '12 MG Road',
          line2: null,
          locality: 'Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560038',
        },
        location: { lat: 12.97, lng: 77.64, source: 'device' },
      },
      BranchDetailSchema,
    );

    // Step 4 — operations
    const hours = await call(
      'PUT',
      paths.partner.hours(branch.id),
      { sessions: [{ dayOfWeek: 0, opensAt: '11:00', closesAt: '23:00' }] },
      HoursResponseSchema,
    );
    expect(hours.sessions).toEqual([{ dayOfWeek: 0, opensAt: '11:00', closesAt: '23:00' }]);
    const { branch: operated } = await call(
      'PATCH',
      paths.partner.branch(branch.id),
      { avgPrepMinutes: 20, minimumOrderMinor: 15000 },
      BranchDetailSchema,
    );
    expect(operated.avgPrepMinutes).toBe(20);
    expect(operated.minimumOrder.amountMinor).toBe(15000);

    // Step 5 — business verification
    await call(
      'PUT',
      paths.partner.business,
      { displayName: 'Thali House', legalName: 'Asha Rao', entityType: 'individual', gstin: null },
      BusinessSchema,
    );

    // Step 6 — bank details
    await call(
      'PUT',
      paths.partner.payoutAccount(branch.id),
      {
        accountHolderName: 'Asha Rao',
        accountNumber: '123456789012',
        confirmAccountNumber: '123456789012',
        ifsc: 'HDFC0001234',
      },
      PayoutAccountResponseSchema,
    );

    // Step 7 — submit
    const submitted = await call('POST', paths.partner.branchSubmit(branch.id), {}, BranchDetailSchema);
    expect(submitted.branch).toMatchObject({ id: branch.id, status: 'pending_review' });
  });

  it('rejects hours with day names instead of 0–6 weekday numbers, like the real API', async () => {
    const res = await mockFetch(`${BASE}${paths.partner.hours('00000000-0000-4007-8000-000000000001')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessions: [{ dayOfWeek: 'monday', opensAt: '11:00', closesAt: '23:00' }] }),
    });
    expect(res.status).toBe(422);
  });

  it('rejects bank details without a matching confirmation, like the real API', async () => {
    const path = `${BASE}${paths.partner.payoutAccount('00000000-0000-4007-8000-000000000001')}`;
    const base = { accountHolderName: 'Asha Rao', accountNumber: '123456789012', ifsc: 'HDFC0001234' };
    for (const body of [base, { ...base, confirmAccountNumber: '123456789000' }]) {
      const res = await mockFetch(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(422);
    }
  });
});
