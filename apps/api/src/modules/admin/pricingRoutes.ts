import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { requireAdmin } from '../../auth/guard';
import { platformPricingConfigs } from '../../db/schema';
import { audit } from '../../lib/audit';
import { notFound, unprocessable } from '../../lib/errors';

const NightChargeConfigSchema = z.object({
  nightChargeEnabled: z.boolean(),
  nightStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24-hour)'),
  nightEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM (24-hour)'),
  chargeType: z.enum(['fixed', 'percent']),
  /** Paise. Required when chargeType is "fixed". */
  chargeAmountMinor: z.number().int().min(0).optional(),
  /** Basis points (1–10000). Required when chargeType is "percent". */
  chargePercentBps: z.number().int().min(1).max(10000).optional(),
  timezone: z.string().default('Asia/Kolkata'),
});

const PricingConfigResponseSchema = NightChargeConfigSchema.extend({
  id: z.string(),
  updatedAt: z.string(),
});

/**
 * Admin pricing configuration: manage the night-time surcharge that is applied to
 * all orders placed during the configured IST window. Only super_admin and operations
 * roles may write; finance may read.
 */
export async function adminPricingRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/admin/pricing-config',
    { schema: { response: { 200: PricingConfigResponseSchema } } },
    async (req) => {
      await requireAdmin(req, ['super_admin', 'operations', 'finance']);
      const [config] = await app.deps.db
        .select()
        .from(platformPricingConfigs)
        .orderBy(platformPricingConfigs.createdAt)
        .limit(1);
      if (!config) throw notFound('Pricing configuration not found. Run the migration to seed it.');
      return toDto(config);
    },
  );

  app.patch(
    '/admin/pricing-config',
    { schema: { body: NightChargeConfigSchema, response: { 200: PricingConfigResponseSchema } } },
    async (req) => {
      const admin = await requireAdmin(req, ['super_admin', 'operations']);
      const { db, clock } = app.deps;
      const { chargeType, chargeAmountMinor, chargePercentBps } = req.body;

      if (chargeType === 'fixed' && chargeAmountMinor === undefined) {
        throw unprocessable('validation', 'chargeAmountMinor is required when chargeType is "fixed".', {
          chargeAmountMinor: ['Required for fixed charges'],
        });
      }
      if (chargeType === 'percent' && chargePercentBps === undefined) {
        throw unprocessable('validation', 'chargePercentBps is required when chargeType is "percent".', {
          chargePercentBps: ['Required for percent charges'],
        });
      }

      const [existing] = await db
        .select({ id: platformPricingConfigs.id })
        .from(platformPricingConfigs)
        .orderBy(platformPricingConfigs.createdAt)
        .limit(1);
      if (!existing) throw notFound('Pricing configuration not found. Run the migration to seed it.');

      const now = clock();
      const [updated] = await db
        .update(platformPricingConfigs)
        .set({
          nightChargeEnabled: req.body.nightChargeEnabled,
          nightStart: req.body.nightStart,
          nightEnd: req.body.nightEnd,
          chargeType,
          chargeAmountMinor: chargeType === 'fixed' ? (chargeAmountMinor ?? 0) : null,
          chargePercentBps: chargeType === 'percent' ? chargePercentBps! : null,
          timezone: req.body.timezone,
          updatedBy: admin.userId,
          updatedAt: now,
        })
        .where(eq(platformPricingConfigs.id, existing.id))
        .returning();

      await audit(db, {
        actorUserId: admin.userId,
        actorType: 'admin',
        action: 'pricing_config.updated',
        entityType: 'platform_pricing_config',
        entityId: existing.id,
        metadata: {
          nightChargeEnabled: req.body.nightChargeEnabled,
          chargeType,
          chargeAmountMinor,
          chargePercentBps,
          nightStart: req.body.nightStart,
          nightEnd: req.body.nightEnd,
        },
        ip: req.ip,
      });

      return toDto(updated!);
    },
  );
}

/** Public read — called by the catalog route to serve pricing info to customers. */
export async function getActivePricingConfig(db: import('../../db/client').Db) {
  const [config] = await db
    .select()
    .from(platformPricingConfigs)
    .orderBy(platformPricingConfigs.createdAt)
    .limit(1);
  return config ?? null;
}

function toDto(config: typeof platformPricingConfigs.$inferSelect) {
  return {
    id: config.id,
    nightChargeEnabled: config.nightChargeEnabled,
    nightStart: config.nightStart,
    nightEnd: config.nightEnd,
    chargeType: config.chargeType,
    chargeAmountMinor: config.chargeAmountMinor ?? undefined,
    chargePercentBps: config.chargePercentBps ?? undefined,
    timezone: config.timezone,
    updatedAt: config.updatedAt.toISOString(),
  };
}
