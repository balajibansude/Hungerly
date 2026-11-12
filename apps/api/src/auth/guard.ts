import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';

import type { AdminRole } from '@hungerly/api-client';

import { adminAccounts, authSessions, branches, businesses, partnerAccounts, users } from '../db/schema';
import { forbidden, notFound, unauthenticated } from '../lib/errors';
import type { Audience } from './tokens';

/**
 * Request authentication and authorization. Every protected handler calls one of these
 * first; nothing trusts identity or roles sent in the request body.
 *
 * Owner isolation: a partner can only reach branches of the business they own. Branches
 * of other owners answer 404 (not 403) so their existence is not revealed.
 */

export interface PartnerAuth {
  userId: string;
  sessionId: string;
  /** The caller's business, or null before the first onboarding step. */
  businessId: string | null;
}

export interface AdminAuth {
  userId: string;
  sessionId: string;
  role: AdminRole;
}

export interface CustomerAuth {
  userId: string;
  sessionId: string;
}

function bearer(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthenticated();
  return header.slice('Bearer '.length).trim();
}

async function verifySession(request: FastifyRequest, audience: Audience) {
  const { tokens, db, clock } = request.server.deps;
  let claims;
  try {
    claims = await tokens.verify(bearer(request), audience);
  } catch {
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
  const [session] = await db
    .select({ id: authSessions.id, userStatus: users.status })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.id, claims.sessionId),
        eq(authSessions.userId, claims.userId),
        eq(authSessions.audience, audience),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, clock()),
      ),
    )
    .limit(1);
  if (!session) throw unauthenticated('Your session has ended. Please sign in again.');
  if (session.userStatus !== 'active') throw forbidden('This account is not active.');
  return claims;
}

/** Signed-in restaurant owner. Legacy non-owner partner rows are refused. */
export async function requirePartner(request: FastifyRequest): Promise<PartnerAuth> {
  const claims = await verifySession(request, 'partner');
  const { db } = request.server.deps;
  const [account] = await db
    .select({ role: partnerAccounts.role, businessId: businesses.id })
    .from(partnerAccounts)
    .leftJoin(businesses, eq(businesses.ownerUserId, partnerAccounts.userId))
    .where(eq(partnerAccounts.userId, claims.userId))
    .limit(1);
  if (!account) throw forbidden('This account is not a restaurant partner account.');
  if (account.role !== 'owner') {
    throw forbidden('Only restaurant owners can use the partner app. Contact Swaadone support.');
  }
  return { userId: claims.userId, sessionId: claims.sessionId, businessId: account.businessId };
}

/**
 * Signed-in customer. Only `customer`-audience sessions pass: partner and admin tokens are
 * refused (401) by the audience check in the token and the session row. Customers have no
 * account table — the session audience is the role — and inactive users are refused (403).
 */
export async function requireCustomer(request: FastifyRequest): Promise<CustomerAuth> {
  const claims = await verifySession(request, 'customer');
  return { userId: claims.userId, sessionId: claims.sessionId };
}

/** Partner who has created their business (most partner routes). */
export async function requireBusiness(request: FastifyRequest): Promise<PartnerAuth & { businessId: string }> {
  const auth = await requirePartner(request);
  if (!auth.businessId) throw notFound('Create your business profile first.');
  return auth as PartnerAuth & { businessId: string };
}

export type BranchRow = typeof branches.$inferSelect;

/**
 * Loads a branch only if it belongs to the caller's business. The single gate for every
 * `/partner/branches/:branchId/...` route.
 */
export async function requireOwnedBranch(
  request: FastifyRequest,
  branchId: string,
): Promise<{ auth: PartnerAuth & { businessId: string }; branch: BranchRow }> {
  const auth = await requireBusiness(request);
  const [branch] = await request.server.deps.db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchId), eq(branches.businessId, auth.businessId)))
    .limit(1);
  if (!branch) throw notFound('Branch not found.');
  return { auth, branch };
}

/** Signed-in administrator holding one of `roles` (super_admin always passes). */
export async function requireAdmin(request: FastifyRequest, roles: AdminRole[]): Promise<AdminAuth> {
  const claims = await verifySession(request, 'admin');
  const [account] = await request.server.deps.db
    .select({ role: adminAccounts.role, isActive: adminAccounts.isActive })
    .from(adminAccounts)
    .where(eq(adminAccounts.userId, claims.userId))
    .limit(1);
  if (!account?.isActive) throw forbidden('Administrator access required.');
  if (account.role !== 'super_admin' && !roles.includes(account.role)) {
    throw forbidden('Your administrator role cannot do this.');
  }
  return { userId: claims.userId, sessionId: claims.sessionId, role: account.role };
}
