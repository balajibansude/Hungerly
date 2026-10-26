import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { IST_UTC_OFFSET_MINUTES } from '@hungerly/utils';

import { getActivePricingConfig } from '../admin/pricingRoutes';

const NightChargePublicSchema = z.object({
  enabled: z.boolean(),
  isNightNow: z.boolean(),
  chargeType: z.enum(['fixed', 'percent']),
  amountMinor: z.number().int(),
  percentBps: z.number().int().nullable(),
  nightStart: z.string(),
  nightEnd: z.string(),
});

const PricingConfigPublicSchema = z.object({
  nightCharge: NightChargePublicSchema,
});

function parseHHMM(value: string): number {
  const [h = 0, m = 0] = value.split(':').map(Number);
  return h * 60 + m;
}

function isInsideNightWindow(minutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes > endMinutes) {
    return minutes >= startMinutes || minutes < endMinutes;
  }
  return minutes >= startMinutes && minutes < endMinutes;
}

/**
 * Public catalog endpoints. No authentication required.
 * GET /catalog/pricing-config — returns the current night-charge status, used by the
 * customer app to show an accurate bill estimate before checkout.
 */
export async function catalogRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();

  app.get(
    '/catalog/pricing-config',
    { schema: { response: { 200: PricingConfigPublicSchema } } },
    async (req) => {
      const config = await getActivePricingConfig(app.deps.db);

      const nowUtc = app.deps.clock();
      const istMinutes =
        ((nowUtc.getTime() + IST_UTC_OFFSET_MINUTES * 60_000) % (24 * 60 * 60_000)) / 60_000;
      const startMinutes = config ? parseHHMM(config.nightStart) : parseHHMM('22:00');
      const endMinutes = config ? parseHHMM(config.nightEnd) : parseHHMM('06:00');
      const isNightNow = isInsideNightWindow(Math.floor(istMinutes), startMinutes, endMinutes);

      const enabled = config?.nightChargeEnabled ?? false;
      const chargeType = config?.chargeType ?? 'fixed';

      return {
        nightCharge: {
          enabled,
          isNightNow,
          chargeType,
          amountMinor: chargeType === 'fixed' ? (config?.chargeAmountMinor ?? 0) : 0,
          percentBps: chargeType === 'percent' ? (config?.chargePercentBps ?? null) : null,
          nightStart: config?.nightStart ?? '22:00',
          nightEnd: config?.nightEnd ?? '06:00',
        },
      };
    },
  );
}
