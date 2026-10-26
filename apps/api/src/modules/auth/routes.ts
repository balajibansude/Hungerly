import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  AdminLoginSchema,
  AdminSignInResponseSchema,
  OkSchema,
  OtpChallengeSchema,
  OtpRequestSchema,
  OtpVerifySchema,
  PartnerSessionSchema,
  paths,
  RefreshSchema,
  SignInResponseSchema,
  TokenPairSchema,
  UpdateProfileSchema,
} from '@hungerly/api-client';

import { requirePartner } from '../../auth/guard';
import { adminAccounts, users } from '../../db/schema';
import { audit } from '../../lib/audit';
import { verifyPassword } from '../../lib/crypto';
import { AppError } from '../../lib/errors';
import { issueSession, loadPartnerSession, refreshSession, requestOtp, revokeSession, verifyOtp } from './service';

/** A fixed hash so a missing admin email costs the same time as a wrong password. */
const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export async function authRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();
  // Tight per-client limits on credential endpoints; relaxed only for the automated test suite.
  const strict = { config: { rateLimit: { max: app.deps.config.NODE_ENV === 'test' ? 1000 : 10, timeWindow: '1 minute' } } };

  app.post(paths.auth.otpRequest, { ...strict, schema: { body: OtpRequestSchema, response: { 200: OtpChallengeSchema } } }, async (req) =>
    requestOtp(app.deps, req.body, req.ip),
  );

  app.post(paths.auth.otpVerify, { ...strict, schema: { body: OtpVerifySchema, response: { 200: SignInResponseSchema } } }, async (req) =>
    verifyOtp(app.deps, req.body, req.headers['user-agent'] ?? null, req.ip),
  );

  app.post(paths.auth.refresh, { ...strict, schema: { body: RefreshSchema, response: { 200: TokenPairSchema } } }, async (req) =>
    refreshSession(app.deps, req.body.refreshToken, 'partner'),
  );

  app.post(paths.auth.logout, { schema: { response: { 200: OkSchema } } }, async (req) => {
    const auth = await requirePartner(req);
    await revokeSession(app.deps.db, auth.sessionId, app.deps.clock());
    return { ok: true as const };
  });

  app.get(paths.partner.me, { schema: { response: { 200: PartnerSessionSchema } } }, async (req) => {
    const auth = await requirePartner(req);
    return loadPartnerSession(app.deps.db, auth.userId);
  });

  app.patch(paths.partner.me, { schema: { body: UpdateProfileSchema, response: { 200: PartnerSessionSchema } } }, async (req) => {
    const auth = await requirePartner(req);
    await app.deps.db.update(users).set({ fullName: req.body.fullName, updatedAt: app.deps.clock() }).where(eq(users.id, auth.userId));
    return loadPartnerSession(app.deps.db, auth.userId);
  });

  // Admin: email + password. TOTP is required before production (docs/restaurant/SECURITY_NOTES.md).
  app.post(paths.auth.adminLogin, { ...strict, schema: { body: AdminLoginSchema, response: { 200: AdminSignInResponseSchema } } }, async (req) => {
    const { db } = app.deps;
    const email = req.body.email.trim().toLowerCase();
    const [row] = await db
      .select({ userId: users.id, email: users.email, role: adminAccounts.role, hash: adminAccounts.passwordHash, isActive: adminAccounts.isActive })
      .from(users)
      .innerJoin(adminAccounts, eq(adminAccounts.userId, users.id))
      .where(eq(users.email, email))
      .limit(1);
    const ok = await verifyPassword(req.body.password, row?.hash ?? DUMMY_HASH);
    if (!row || !ok || !row.isActive) {
      throw new AppError(401, 'unauthenticated', 'Email or password is incorrect.');
    }
    const tokens = await issueSession(app.deps, db, row.userId, 'admin', req.headers['user-agent'] ?? null);
    await audit(db, { actorUserId: row.userId, actorType: 'admin', action: 'admin.signed_in', entityType: 'user', entityId: row.userId, ip: req.ip });
    return { tokens, admin: { id: row.userId, email: row.email!, role: row.role } };
  });

  app.post('/admin/auth/refresh', { ...strict, schema: { body: RefreshSchema, response: { 200: TokenPairSchema } } }, async (req) =>
    refreshSession(app.deps, req.body.refreshToken, 'admin'),
  );
}
