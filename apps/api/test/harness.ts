import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { generateKeyPairSync, randomBytes } from 'node:crypto';

import { buildApp } from '../src/app';
import type { OtpSender } from '../src/auth/otpSender';
import { loadConfig, type Config } from '../src/config';
import { MIGRATIONS_DIR, schema, type Db } from '../src/db/client';
import { adminAccounts, branchHours, branches, businesses, payoutAccounts, users } from '../src/db/schema';
import { hashPassword, hmacHex } from '../src/lib/crypto';
import { createMemoryStorage } from '../src/lib/storage';
import { unconfiguredProvider, type PayoutProvider } from '../src/modules/payouts/provider';

/**
 * Test harness: a real PostgreSQL engine (PGlite, in-process) with the real migrations,
 * the real Fastify app and an adjustable clock. No mocks of our own code.
 */

const keys = generateKeyPairSync('ed25519');
const oneLine = (pem: string) => pem.trim().replace(/\n/g, '\\n');

export function testConfig(overrides: Partial<Record<keyof Config, string>> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    DATABASE_URL: 'pglite://memory',
    JWT_PRIVATE_KEY: oneLine(keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()),
    JWT_PUBLIC_KEY: oneLine(keys.publicKey.export({ type: 'spki', format: 'pem' }).toString()),
    TOKEN_HASH_SECRET: randomBytes(32).toString('base64url'),
    FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    ...overrides,
  });
}

/** Captures codes instead of sending them, so tests sign in like a real user. */
export function capturingOtpSender(): OtpSender & { last: Map<string, string> } {
  const last = new Map<string, string>();
  return {
    kind: 'provider',
    last,
    async send(_channel, identifier, code) {
      last.set(identifier, code);
    },
  };
}

export interface TestContext {
  app: FastifyInstance;
  db: Db;
  pg: PGlite;
  config: Config;
  otp: ReturnType<typeof capturingOtpSender>;
  storage: ReturnType<typeof createMemoryStorage>;
  clock: { now: Date; set(iso: string): void; advance(ms: number): void };
  close(): Promise<void>;
}

export async function createTestContext(
  options: { payoutProvider?: PayoutProvider; config?: Partial<Record<keyof Config, string>>; now?: string } = {},
): Promise<TestContext> {
  const pg = new PGlite();
  const db = drizzle(pg, { schema }) as unknown as Db;
  await migrate(drizzle(pg), { migrationsFolder: MIGRATIONS_DIR });
  const config = testConfig(options.config);
  const otp = capturingOtpSender();
  const storage = createMemoryStorage();
  const clock = {
    now: new Date(options.now ?? '2026-10-12T06:30:00.000Z'),
    set(iso: string) {
      clock.now = new Date(iso);
    },
    advance(ms: number) {
      clock.now = new Date(clock.now.getTime() + ms);
    },
  };
  const app = await buildApp({
    config,
    db,
    storage,
    payoutProvider: options.payoutProvider ?? unconfiguredProvider,
    clock: () => clock.now,
    otpSender: otp,
    logger: false,
  });
  await app.ready();
  return {
    app,
    db,
    pg,
    config,
    otp,
    storage,
    clock,
    async close() {
      await app.close();
      await pg.close();
    },
  };
}

export async function call<T = unknown>(
  ctx: TestContext,
  method: InjectOptions['method'],
  url: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T }> {
  const response = await ctx.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    ...(options.body !== undefined ? { payload: options.body as InjectOptions['payload'] } : {}),
  });
  const text = response.body;
  return { status: response.statusCode, body: (text ? JSON.parse(text) : undefined) as T };
}

let phoneCounter = 0;

/** Signs in a brand-new owner through the real OTP flow. */
export async function signInOwner(ctx: TestContext, phone?: string) {
  phoneCounter += 1;
  const phoneE164 = phone ?? `+9198${String(10_000_000 + phoneCounter * 7919).slice(-8)}`;
  const challenge = await call<{ requestId: string }>(ctx, 'POST', '/auth/otp/request', {
    body: { channel: 'phone', phoneE164 },
  });
  if (challenge.status !== 200) throw new Error(`otp request failed: ${JSON.stringify(challenge.body)}`);
  const code = ctx.otp.last.get(phoneE164)!;
  const verified = await call<{ tokens: { accessToken: string; refreshToken: string }; session: { user: { id: string } } }>(
    ctx,
    'POST',
    '/auth/otp/verify',
    { body: { requestId: challenge.body.requestId, code } },
  );
  if (verified.status !== 200) throw new Error(`otp verify failed: ${JSON.stringify(verified.body)}`);
  // Space out sign-ins so the per-identifier resend limit never trips across tests.
  ctx.clock.advance(31_000);
  return {
    token: verified.body.tokens.accessToken,
    refreshToken: verified.body.tokens.refreshToken,
    userId: verified.body.session.user.id,
    phoneE164,
  };
}

// --- Direct-to-database fixtures (for tests of modules that need a ready branch) -------


/** Creates an admin user with a password and signs them in. */
export async function signInAdmin(ctx: TestContext, role: 'super_admin' | 'operations' | 'finance' | 'support' = 'operations') {
  const email = `admin-${role}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const password = 'correct horse battery staple';
  const [user] = await ctx.db.insert(users).values({ email, fullName: `Test ${role}` }).returning();
  await ctx.db.insert(adminAccounts).values({ userId: user!.id, role, passwordHash: await hashPassword(password) });
  const res = await call<{ tokens: { accessToken: string } }>(ctx, 'POST', '/admin/auth/login', { body: { email, password } });
  if (res.status !== 200) throw new Error(`admin login failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.tokens.accessToken, userId: user!.id };
}

/**
 * Inserts a business (if missing) and an *active*, approved branch for an owner, open
 * every day 08:00–16:00 and 17:00–23:00 (a one-hour break), accepting orders.
 */
export async function createActiveBranch(
  ctx: TestContext,
  ownerUserId: string,
  options: { name?: string; commissionBps?: number; verifiedPayoutAccount?: boolean } = {},
) {
  let [business] = await ctx.db.select().from(businesses).where(eqUser(ownerUserId));
  if (!business) {
    [business] = await ctx.db
      .insert(businesses)
      .values({ ownerUserId, displayName: 'Test Kitchens', legalName: 'Test Kitchens Pvt Ltd', entityType: 'company' })
      .returning();
  }
  const [branch] = await ctx.db
    .insert(branches)
    .values({
      businessId: business!.id,
      name: options.name ?? 'Masala Junction',
      cuisines: ['North Indian'],
      phoneE164: '+919876543210',
      addressLine1: '12 MG Road',
      locality: 'Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      latitude: 12.9719,
      longitude: 77.6412,
      locationSource: 'map_pin',
      status: 'active',
      isAcceptingOrders: true,
      commissionBps: options.commissionBps ?? 2000,
      submittedAt: ctx.clock.now,
      approvedAt: ctx.clock.now,
    })
    .returning();
  const sessions = [0, 1, 2, 3, 4, 5, 6].flatMap((day) => [
    { branchId: branch!.id, dayOfWeek: day, opensAt: '08:00', closesAt: '16:00' },
    { branchId: branch!.id, dayOfWeek: day, opensAt: '17:00', closesAt: '23:00' },
  ]);
  await ctx.db.insert(branchHours).values(sessions);
  if (options.verifiedPayoutAccount) {
    await ctx.db.insert(payoutAccounts).values({
      branchId: branch!.id,
      accountHolderName: 'Test Kitchens Pvt Ltd',
      accountLast4: '6789',
      ifsc: 'HDFC0001234',
      accountFingerprint: hmacHex(ctx.config.TOKEN_HASH_SECRET, `acct:${branch!.id}`),
      providerContactId: 'cont_test',
      providerFundAccountId: `fa_test_${branch!.id.slice(0, 8)}`,
      status: 'verified',
      verifiedAt: ctx.clock.now,
      verifiedVia: 'finance_review',
      createdBy: ownerUserId,
    });
  }
  return { business: business!, branch: branch! };
}

function eqUser(ownerUserId: string) {
  return eq(businesses.ownerUserId, ownerUserId);
}
