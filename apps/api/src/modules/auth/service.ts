import { and, desc, eq, gt, isNull, or } from 'drizzle-orm';

import type { CustomerProfile, CustomerSignInResponse, OtpRequest, PartnerSession } from '@hungerly/api-client';

import type { AppDeps } from '../../app';
import type { Audience } from '../../auth/tokens';
import type { Db } from '../../db/client';
import { authSessions, branches, businesses, otpChallenges, partnerAccounts, users } from '../../db/schema';
import { audit } from '../../lib/audit';
import { hmacHex, randomOtp, randomToken, safeEqual } from '../../lib/crypto';
import { AppError, unauthenticated, unavailable } from '../../lib/errors';

const OTP_TTL_SECONDS = 5 * 60;
const OTP_RESEND_SECONDS = 30;
const OTP_MAX_ATTEMPTS = 5;
/** At most this many codes per identifier per 15 minutes. */
const OTP_WINDOW_LIMIT = 5;

export function identifierOf(request: OtpRequest): string {
  return request.channel === 'phone' ? request.phoneE164 : request.email.trim().toLowerCase();
}

export async function requestOtp(deps: AppDeps, request: OtpRequest, ip: string | null) {
  const { db, clock, config, otpSender } = deps;
  if (otpSender.kind === 'none') {
    throw unavailable('auth.delivery_unavailable', 'Sign-in codes cannot be sent right now. Please try later.');
  }
  const identifier = identifierOf(request);
  const now = clock();
  const recent = await db
    .select({ createdAt: otpChallenges.createdAt })
    .from(otpChallenges)
    .where(and(eq(otpChallenges.identifier, identifier), gt(otpChallenges.createdAt, new Date(now.getTime() - 15 * 60_000))))
    .orderBy(desc(otpChallenges.createdAt));
  if (recent.length >= OTP_WINDOW_LIMIT) {
    throw new AppError(429, 'rate_limited', 'Too many codes requested. Please wait a few minutes.');
  }
  const latest = recent[0];
  if (latest && now.getTime() - latest.createdAt.getTime() < OTP_RESEND_SECONDS * 1000) {
    throw new AppError(429, 'rate_limited', 'Please wait a few seconds before asking for a new code.');
  }

  const code = randomOtp();
  const [challenge] = await db
    .insert(otpChallenges)
    .values({
      channel: request.channel,
      identifier,
      codeHash: hmacHex(config.TOKEN_HASH_SECRET, `${identifier}:${code}`),
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      ip,
      // Same clock as the resend/window checks above (not the database's default now()).
      createdAt: now,
    })
    .returning({ id: otpChallenges.id });
  await otpSender.send(request.channel, identifier, code);
  return {
    requestId: challenge!.id,
    expiresInSeconds: OTP_TTL_SECONDS,
    resendAfterSeconds: OTP_RESEND_SECONDS,
    ...(otpSender.kind === 'server_log' ? { devDelivery: 'server_log' as const } : {}),
  };
}

async function issueSession(deps: AppDeps, db: Db, userId: string, audience: Audience, userAgent: string | null) {
  const { config, clock, tokens } = deps;
  const refreshToken = randomToken(32);
  const [session] = await db
    .insert(authSessions)
    .values({
      userId,
      audience,
      refreshHash: hmacHex(config.TOKEN_HASH_SECRET, refreshToken),
      expiresAt: new Date(clock().getTime() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      userAgent,
    })
    .returning({ id: authSessions.id });
  const accessToken = await tokens.sign({ userId, sessionId: session!.id, audience });
  return { accessToken, refreshToken, accessExpiresInSeconds: tokens.ttlSeconds };
}

export { issueSession };

type OtpChallengeRow = typeof otpChallenges.$inferSelect;
type UserRow = typeof users.$inferSelect;

/**
 * Checks a code against its challenge: unknown/used, expiry, attempt limit, then the code
 * itself (a wrong code counts an attempt). Shared by every OTP sign-in; app-agnostic.
 */
async function checkOtpCode(deps: AppDeps, input: { requestId: string; code: string }, now: Date): Promise<OtpChallengeRow> {
  const { db, config } = deps;
  const [challenge] = await db.select().from(otpChallenges).where(eq(otpChallenges.id, input.requestId)).limit(1);
  if (!challenge || challenge.consumedAt) {
    throw unauthenticated('This code is no longer valid. Request a new one.');
  }
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    throw new AppError(401, 'auth.otp_expired', 'This code has expired. Request a new one.');
  }
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError(429, 'auth.otp_attempts_exceeded', 'Too many wrong attempts. Request a new code.');
  }
  const expected = hmacHex(config.TOKEN_HASH_SECRET, `${challenge.identifier}:${input.code}`);
  const devCodeOk =
    config.NODE_ENV !== 'production' && !!config.OTP_DEV_FIXED_CODE && input.code === config.OTP_DEV_FIXED_CODE;
  if (!safeEqual(expected, challenge.codeHash) && !devCodeOk) {
    await db.update(otpChallenges).set({ attempts: challenge.attempts + 1 }).where(eq(otpChallenges.id, challenge.id));
    throw new AppError(401, 'auth.otp_invalid', 'That code is not right. Check it and try again.');
  }
  return challenge;
}

/**
 * Inside the sign-in transaction: consumes the challenge exactly once, then finds or
 * creates the user for its phone/email. Inactive users are refused. Grants no app role.
 */
async function consumeOtpAndResolveUser(
  tx: Db,
  challenge: OtpChallengeRow,
  now: Date,
): Promise<{ user: UserRow; isNew: boolean }> {
  const consumed = await tx
    .update(otpChallenges)
    .set({ consumedAt: now })
    .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
    .returning({ id: otpChallenges.id });
  if (consumed.length === 0) throw unauthenticated('This code was already used. Request a new one.');

  const byIdentity =
    challenge.channel === 'phone' ? eq(users.phoneE164, challenge.identifier) : eq(users.email, challenge.identifier);
  let [user] = await tx.select().from(users).where(byIdentity).limit(1);
  let isNew = false;
  if (!user) {
    [user] = await tx
      .insert(users)
      .values(challenge.channel === 'phone' ? { phoneE164: challenge.identifier } : { email: challenge.identifier })
      .returning();
    isNew = true;
  }
  if (user!.status !== 'active') throw new AppError(403, 'forbidden', 'This account is not active.');
  return { user: user!, isNew };
}

/**
 * Verifies a code and signs in. A first-time identity becomes a new user with a
 * restaurant *owner* partner account — the only role the partner app grants. Existing
 * users without a partner account (e.g. customers) also get an owner partner account;
 * existing legacy non-owner partner rows are left untouched and refused by the guard.
 */
export async function verifyOtp(
  deps: AppDeps,
  input: { requestId: string; code: string },
  userAgent: string | null,
  ip: string | null,
) {
  const { db, clock } = deps;
  const now = clock();
  const challenge = await checkOtpCode(deps, input, now);

  return db.transaction(async (tx) => {
    const { user } = await consumeOtpAndResolveUser(tx, challenge, now);
    const created = await tx
      .insert(partnerAccounts)
      .values({ userId: user!.id, role: 'owner' })
      .onConflictDoNothing()
      .returning({ userId: partnerAccounts.userId });
    if (created.length > 0) {
      await audit(tx, {
        actorUserId: user!.id,
        actorType: 'owner',
        action: 'partner_account.created',
        entityType: 'user',
        entityId: user!.id,
        ip,
      });
    }
    const tokens = await issueSession(deps, tx, user!.id, 'partner', userAgent);
    return { tokens, session: await loadPartnerSession(tx, user!.id) };
  });
}

/**
 * Customer-app sign-in. Same code checks and user resolution as `verifyOtp`, but issues a
 * `customer` session and never creates a partner account. `isNewUser` tells the app to
 * ask for the customer's name (new identity, or no name saved yet).
 */
export async function verifyCustomerOtp(
  deps: AppDeps,
  input: { requestId: string; code: string },
  userAgent: string | null,
): Promise<CustomerSignInResponse> {
  const { db, clock } = deps;
  const now = clock();
  const challenge = await checkOtpCode(deps, input, now);

  return db.transaction(async (tx) => {
    const { user, isNew } = await consumeOtpAndResolveUser(tx, challenge, now);
    const tokens = await issueSession(deps, tx, user.id, 'customer', userAgent);
    return {
      tokens,
      customer: {
        user: { id: user.id, fullName: user.fullName, phoneE164: user.phoneE164, email: user.email },
        isNewUser: isNew || !user.fullName,
      },
    };
  });
}

/**
 * Refresh-token rotation with reuse detection: each refresh token works once. Presenting
 * an already-rotated token revokes the whole session (it was likely stolen).
 */
export async function refreshSession(deps: AppDeps, refreshToken: string, audience: Audience) {
  const { db, clock, config, tokens } = deps;
  const hash = hmacHex(config.TOKEN_HASH_SECRET, refreshToken);
  const now = clock();
  const expired = () => new AppError(401, 'auth.session_expired', 'Your session has ended. Please sign in again.');
  const outcome = await db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.audience, audience), or(eq(authSessions.refreshHash, hash), eq(authSessions.previousRefreshHash, hash))))
      .limit(1);
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) return { kind: 'expired' as const };
    if (session.refreshHash !== hash) {
      // Committed even though the caller gets an error: a reused token kills the session.
      await tx
        .update(authSessions)
        .set({ revokedAt: now, revokedReason: 'refresh_token_reuse' })
        .where(eq(authSessions.id, session.id));
      return { kind: 'reused' as const };
    }
    const next = randomToken(32);
    const rotated = await tx
      .update(authSessions)
      .set({ previousRefreshHash: hash, refreshHash: hmacHex(config.TOKEN_HASH_SECRET, next), lastUsedAt: now })
      .where(and(eq(authSessions.id, session.id), eq(authSessions.refreshHash, hash)))
      .returning({ id: authSessions.id });
    if (rotated.length === 0) return { kind: 'expired' as const };
    const accessToken = await tokens.sign({ userId: session.userId, sessionId: session.id, audience });
    return { kind: 'ok' as const, tokens: { accessToken, refreshToken: next, accessExpiresInSeconds: tokens.ttlSeconds } };
  });
  if (outcome.kind !== 'ok') throw expired();
  return outcome.tokens;
}

export async function revokeSession(db: Db, sessionId: string, now: Date) {
  await db
    .update(authSessions)
    .set({ revokedAt: now, revokedReason: 'logout' })
    .where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)));
}

/** The customer's own profile: identity fields only (no status, role or timestamps). */
export async function loadCustomerProfile(db: Db, userId: string): Promise<CustomerProfile> {
  const [user] = await db
    .select({ id: users.id, fullName: users.fullName, phoneE164: users.phoneE164, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw unauthenticated();
  return user;
}

export async function loadPartnerSession(db: Db, userId: string): Promise<PartnerSession> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw unauthenticated();
  const [business] = await db.select().from(businesses).where(eq(businesses.ownerUserId, userId)).limit(1);
  const branchRows = business
    ? await db
        .select({ id: branches.id, name: branches.name, locality: branches.locality, city: branches.city, status: branches.status })
        .from(branches)
        .where(eq(branches.businessId, business.id))
        .orderBy(branches.createdAt)
    : [];
  return {
    user: { id: user.id, fullName: user.fullName, phoneE164: user.phoneE164, email: user.email },
    business: business
      ? {
          id: business.id,
          displayName: business.displayName,
          legalName: business.legalName,
          entityType: business.entityType,
          gstin: business.gstin,
        }
      : null,
    branches: branchRows.map((b) => ({ ...b, role: 'owner' as const })),
  };
}
