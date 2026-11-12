import {
  ApiError,
  BusinessSchema,
  paths,
  type ApiClient,
  type Business,
  type UpsertBusiness,
} from '@hungerly/api-client';

/**
 * Smallest valid `PUT /partner/business` body, built from the restaurant name entered in
 * registration step 1. Step 5 (business verification) replaces it with the real legal name,
 * entity type and GSTIN; PUT updates the owner's single business, so no duplicate is made.
 */
export function minimalBusinessBody(restaurantName: string): UpsertBusiness {
  const name = restaurantName.trim();
  return { displayName: name, legalName: name, entityType: 'individual', gstin: null };
}

/**
 * Returns the signed-in owner's business, creating a minimal one first if none exists.
 * Branch routes require a business, so this must run before the first branch is created.
 * An existing business is returned untouched so resumed registrations keep their details.
 */
export async function ensureBusiness(client: Pick<ApiClient, 'request'>, restaurantName: string): Promise<Business> {
  try {
    return await client.request('GET', paths.partner.business, { schema: BusinessSchema });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error;
  }
  return client.request('PUT', paths.partner.business, {
    schema: BusinessSchema,
    body: minimalBusinessBody(restaurantName),
  });
}
