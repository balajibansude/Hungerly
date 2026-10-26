import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { paths } from '@hungerly/api-client';

import type { AppDeps } from '../../app';
import { payoutAccounts, payouts, providerWebhookEvents } from '../../db/schema';
import { AppError } from '../../lib/errors';
import { applyValidation } from './accounts';
import { mapPayoutEntity, mapValidationEntity } from './razorpayx';
import { applyProviderPayout, isUuid } from './service';

/**
 * RazorpayX webhooks. Security model:
 * 1. The signature (HMAC-SHA256 of the exact raw body) must verify, or nothing happens.
 * 2. Each event id is stored once (unique index); a redelivered event that was already
 *    processed is acknowledged without being applied again.
 * 3. Events only move statuses through the same monotonic rules as API responses;
 *    amounts in the payload are ignored (reversals use our own payout amount).
 */

interface WebhookBody {
  event?: string;
  payload?: Record<string, { entity?: Record<string, unknown> } | undefined>;
}

export async function webhookRoutes(api: FastifyInstance) {
  // Encapsulated: the raw-body JSON parser applies to this plugin's routes only.
  api.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body as Buffer;
    try {
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    } catch {
      done(new AppError(400, 'validation', 'Invalid JSON.'), undefined);
    }
  });

  api.post(paths.webhooks.razorpayx, { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { deps } = api;
    const signature = req.headers['x-razorpay-signature'];
    const raw = req.rawBody;
    if (!raw || !deps.payoutProvider.verifyWebhookSignature(raw, Array.isArray(signature) ? signature[0] : signature)) {
      throw new AppError(400, 'validation', 'Invalid webhook signature.');
    }
    const eventIdHeader = req.headers['x-razorpay-event-id'];
    const eventId = Array.isArray(eventIdHeader) ? eventIdHeader[0] : eventIdHeader;
    if (!eventId) throw new AppError(400, 'validation', 'Missing event id.');
    const body = req.body as WebhookBody;
    const eventType = typeof body.event === 'string' ? body.event : 'unknown';

    await deps.db
      .insert(providerWebhookEvents)
      .values({ provider: 'razorpayx', eventId, eventType, payload: body })
      .onConflictDoNothing();
    // Claim the event only if it has not been processed (a failed earlier attempt is retried).
    const [pending] = await deps.db
      .select()
      .from(providerWebhookEvents)
      .where(
        and(
          eq(providerWebhookEvents.provider, 'razorpayx'),
          eq(providerWebhookEvents.eventId, eventId),
          isNull(providerWebhookEvents.processedAt),
        ),
      )
      .limit(1);
    if (!pending) return reply.status(200).send({ ok: true, duplicate: true });

    try {
      const note = await processEvent(deps, eventType, body);
      await deps.db
        .update(providerWebhookEvents)
        .set({ processedAt: deps.clock(), error: note })
        .where(eq(providerWebhookEvents.id, pending.id));
    } catch (error) {
      await deps.db
        .update(providerWebhookEvents)
        .set({ error: (error as Error).message.slice(0, 500) })
        .where(eq(providerWebhookEvents.id, pending.id));
      // Non-2xx so RazorpayX redelivers; the stored event is retried then.
      throw error;
    }
    return reply.status(200).send({ ok: true });
  });
}

/** Returns a note when the event was accepted but not applied (unknown entity). */
async function processEvent(deps: AppDeps, eventType: string, body: WebhookBody): Promise<string | null> {
  if (eventType.startsWith('payout.downtime')) return 'ignored: downtime notice';

  if (eventType.startsWith('payout.')) {
    const entity = body.payload?.payout?.entity as Parameters<typeof mapPayoutEntity>[0] | undefined;
    if (!entity?.id) return 'ignored: no payout entity';
    const providerPayout = mapPayoutEntity(entity);
    const [byProviderId] = await deps.db
      .select({ id: payouts.id })
      .from(payouts)
      .where(eq(payouts.providerPayoutId, entity.id))
      .limit(1);
    let payoutId = byProviderId?.id;
    if (!payoutId && isUuid(providerPayout.referenceId)) {
      const [byReference] = await deps.db
        .select({ id: payouts.id })
        .from(payouts)
        .where(eq(payouts.id, providerPayout.referenceId))
        .limit(1);
      payoutId = byReference?.id;
    }
    if (!payoutId) return `ignored: unknown payout ${entity.id}`;
    await applyProviderPayout(deps, payoutId, providerPayout);
    return null;
  }

  if (eventType.startsWith('fund_account.validation')) {
    const container = body.payload?.['fund_account.validation'] ?? body.payload?.fund_account_validation;
    const entity = container?.entity as Parameters<typeof mapValidationEntity>[0] | undefined;
    if (!entity?.id) return 'ignored: no validation entity';
    const [account] = await deps.db
      .select({ id: payoutAccounts.id })
      .from(payoutAccounts)
      .where(eq(payoutAccounts.providerValidationId, entity.id))
      .limit(1);
    if (!account) return `ignored: unknown validation ${entity.id}`;
    await applyValidation(deps, account.id, mapValidationEntity(entity));
    return null;
  }

  return `ignored: ${eventType}`;
}
