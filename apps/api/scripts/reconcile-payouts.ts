/**
 * Reconciles payouts with RazorpayX: re-submits payouts stuck in `requested` (same
 * idempotency key, so never a duplicate transfer) and polls in-flight payouts whose
 * webhooks may have been missed. Run every few minutes from a scheduler (cron, ECS task).
 *   pnpm --filter @hungerly/api payouts:reconcile
 */
import Fastify from 'fastify';

import type { AppDeps } from '../src/app';
import { createOtpSender } from '../src/auth/otpSender';
import { createTokenSigner } from '../src/auth/tokens';
import { loadConfig } from '../src/config';
import { connectPostgres } from '../src/db/client';
import { createLocalStorage } from '../src/lib/storage';
import { systemClock } from '../src/lib/time';
import { createPayoutProvider } from '../src/modules/payouts/razorpayx';
import { reconcilePayouts } from '../src/modules/payouts/service';

const config = loadConfig();
const database = connectPostgres(config.DATABASE_URL);
const log = Fastify({ logger: { level: config.LOG_LEVEL } }).log;
const deps: AppDeps = {
  config,
  db: database.db,
  storage: createLocalStorage(config.STORAGE_DIR),
  clock: systemClock,
  payoutProvider: createPayoutProvider(config),
  tokens: await createTokenSigner(config),
  otpSender: createOtpSender(config, log),
};

try {
  if (deps.payoutProvider.mode === 'unconfigured') {
    console.warn('Payout provider is not configured; nothing to reconcile.');
  } else {
    const result = await reconcilePayouts(deps);
    console.warn(`Reconciled payouts (${deps.payoutProvider.mode}): ${JSON.stringify(result)}`);
  }
} finally {
  await database.close();
}
