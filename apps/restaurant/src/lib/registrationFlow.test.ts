/**
 * End-to-end contract test for the registration wizard (`(onboarding)/register.tsx`)
 * against the mock API. Every request goes through the real `createApiClient`, so a
 * mock response that drifts from its Zod schema fails here with the same
 * `invalid_response` error the app shows ("The app received data it does not understand").
 */

import {
  BranchDetailSchema,
  BusinessSchema,
  createApiClient,
  PartnerSessionSchema,
  paths,
  PayoutAccountResponseSchema,
} from '@hungerly/api-client';

import { saveOperations, type OperationsForm } from '@/features/onboarding/operations';

import { mockFetch } from './mockFetch';

const api = createApiClient({
  baseUrl: 'http://prototype.swaadone.invalid/api/v1',
  fetchImpl: mockFetch as typeof fetch,
});

const OPERATIONS: OperationsForm = {
  hours: [
    { day: 'monday', label: 'Monday', isOpen: true, opensAt: '11:00', closesAt: '23:00' },
    { day: 'tuesday', label: 'Tuesday', isOpen: true, opensAt: '11:00', closesAt: '23:00' },
    { day: 'wednesday', label: 'Wednesday', isOpen: true, opensAt: '11:00', closesAt: '23:00' },
    { day: 'thursday', label: 'Thursday', isOpen: true, opensAt: '11:00', closesAt: '23:00' },
    { day: 'friday', label: 'Friday', isOpen: true, opensAt: '11:00', closesAt: '23:30' },
    { day: 'saturday', label: 'Saturday', isOpen: true, opensAt: '10:00', closesAt: '23:30' },
    { day: 'sunday', label: 'Sunday', isOpen: false, opensAt: '10:00', closesAt: '22:30' },
  ],
  avgPrepMinutes: 20,
  minOrderAmount: '149.50',
};

describe('registration wizard against the mock API', () => {
  it('progresses through all seven steps and submits', async () => {
    // Step 1: create the branch, then save its details.
    const { branch: created } = await api.request('POST', paths.partner.branches, {
      schema: BranchDetailSchema,
      body: { name: 'Thali House' },
    });
    const { branch: details } = await api.request('PATCH', paths.partner.branch(created.id), {
      schema: BranchDetailSchema,
      body: { description: 'Home-style thalis.', cuisines: ['North Indian'], foodType: 'veg_only' },
    });
    expect(details.id).toBe(created.id);

    // Step 2: owner details.
    await api.request('PATCH', paths.partner.me, {
      schema: PartnerSessionSchema,
      body: { fullName: 'Asha Rao', email: 'asha@example.com' },
    });

    // Step 3: address and map pin.
    const { branch: located } = await api.request('PATCH', paths.partner.branch(created.id), {
      schema: BranchDetailSchema,
      body: {
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
    });
    expect(located.address?.city).toBe('Bengaluru');

    // Step 4: Operations — the screen's Continue action.
    const operations = await saveOperations(api, created.id, OPERATIONS);
    expect(operations.ok).toBe(true);

    // Step 5: business profile.
    await api.request('PUT', paths.partner.business, {
      schema: BusinessSchema,
      body: { displayName: 'Thali House', legalName: 'Asha Rao', entityType: 'individual', gstin: null },
    });

    // Step 6: payout account.
    await api.request('PUT', paths.partner.payoutAccount(created.id), {
      schema: PayoutAccountResponseSchema,
      body: {
        accountHolderName: 'Asha Rao',
        accountNumber: '123456789012',
        confirmAccountNumber: '123456789012',
        ifsc: 'HDFC0001234',
      },
    });

    // Step 7: submit for review.
    const submitted = await api.request('POST', paths.partner.branchSubmit(created.id), {
      schema: BranchDetailSchema,
      body: {},
    });
    expect(submitted.branch.id).toBe(created.id);
    expect(submitted.branch.status).toBe('pending_review');

    // What the partner entered survives to the submitted branch.
    expect(submitted.branch).toMatchObject({
      name: 'Thali House',
      description: 'Home-style thalis.',
      cuisines: ['North Indian'],
      foodType: 'veg_only',
      address: { city: 'Bengaluru', postalCode: '560038' },
      avgPrepMinutes: 20,
      minimumOrder: { amountMinor: 14950 },
    });
    expect(submitted.branch.hours).toHaveLength(6);
  });

  it('saves Operations without a map pin or minimum order', async () => {
    const { branch: created } = await api.request('POST', paths.partner.branches, {
      schema: BranchDetailSchema,
      body: { name: 'Corner Cafe' },
    });
    await api.request('PATCH', paths.partner.branch(created.id), {
      schema: BranchDetailSchema,
      body: {
        address: { line1: '4 Park St', line2: null, locality: 'Park Street', city: 'Kolkata', state: 'West Bengal', postalCode: '700016' },
        location: undefined,
      },
    });

    const result = await saveOperations(api, created.id, {
      ...OPERATIONS,
      hours: OPERATIONS.hours.map((h) => ({ ...h, isOpen: true, opensAt: '1800', closesAt: '0200' })),
      avgPrepMinutes: 45,
      minOrderAmount: '',
    });
    expect(result.ok).toBe(true);
  });
});
