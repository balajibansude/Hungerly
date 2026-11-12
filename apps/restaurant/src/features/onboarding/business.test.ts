import { ApiError, paths, UpsertBusinessSchema } from '@hungerly/api-client';

import { ensureBusiness, minimalBusinessBody } from './business';

const BUSINESS = {
  id: '6f1c2b1e-3a4d-4e5f-8a6b-7c8d9e0f1a2b',
  displayName: 'Spice Route',
  legalName: 'Spice Route',
  entityType: 'individual' as const,
  gstin: null,
};

function fakeClient(get: () => Promise<unknown>) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const request = jest.fn(async (method: string, path: string, opts: { body?: unknown } = {}) => {
    calls.push({ method, path, body: opts.body });
    if (method === 'GET') return get();
    return BUSINESS;
  });
  return { client: { request } as never, calls };
}

describe('minimalBusinessBody', () => {
  it('passes the PUT /partner/business contract using the restaurant name', () => {
    const body = minimalBusinessBody('  Spice Route ');
    expect(body).toEqual({ displayName: 'Spice Route', legalName: 'Spice Route', entityType: 'individual', gstin: null });
    expect(UpsertBusinessSchema.safeParse(body).success).toBe(true);
  });
});

describe('ensureBusiness', () => {
  it('returns the existing business without overwriting it', async () => {
    const { client, calls } = fakeClient(async () => BUSINESS);
    await expect(ensureBusiness(client, 'Other Name')).resolves.toEqual(BUSINESS);
    expect(calls).toEqual([{ method: 'GET', path: paths.partner.business, body: undefined }]);
  });

  it('creates a minimal business when the owner has none (404)', async () => {
    const { client, calls } = fakeClient(async () => {
      throw new ApiError(404, 'not_found', 'Create your business profile first.');
    });
    await expect(ensureBusiness(client, 'Spice Route')).resolves.toEqual(BUSINESS);
    expect(calls[1]).toEqual({ method: 'PUT', path: paths.partner.business, body: minimalBusinessBody('Spice Route') });
  });

  it('does not create a business when the lookup fails for another reason', async () => {
    const { client, calls } = fakeClient(async () => {
      throw new ApiError(0, 'network', 'You are offline.');
    });
    await expect(ensureBusiness(client, 'Spice Route')).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });
});
