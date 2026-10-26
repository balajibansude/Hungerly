import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  AdminCouponPageSchema,
  CouponInputSchema,
  CouponPatchSchema,
  CouponPolicySchema,
  CouponPreviewSchema,
  CouponSchema,
  paths,
  RejectWithReasonSchema,
} from '@hungerly/api-client';

import { requireAdmin, requireBusiness } from '../../auth/guard';
import { businesses, coupons } from '../../db/schema';
import { audit } from '../../lib/audit';
import { conflict, notFound } from '../../lib/errors';
import {
  couponDto,
  couponPolicy,
  couponScope,
  createCoupon,
  evaluateCoupon,
  loadOwnedCoupon,
  toCouponDto,
  updateCoupon,
} from './service';

const CouponParams = z.object({ couponId: z.uuid() });
const CouponListSchema = z.object({ items: z.array(CouponSchema) });
const AdminCouponQuery = z.object({
  status: z
    .enum(['pending_approval', 'approved', 'rejected', 'cancelled'])
    .default('pending_approval'),
});

/**
 * Restaurant coupons. Approval is decided by the server from configured thresholds; the
 * request body has no approval field (unknown keys are stripped), so an owner can never
 * approve their own coupon. Admin review lives under /admin/coupons (operations role).
 */
export async function couponRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();

  app.get(
    paths.partner.couponPolicy,
    { schema: { response: { 200: CouponPolicySchema } } },
    async (req) => {
      await requireBusiness(req);
      return couponPolicy(app.deps.config);
    },
  );

  app.post(
    paths.partner.couponPreview,
    { schema: { body: CouponInputSchema, response: { 200: CouponPreviewSchema } } },
    async (req) => {
      await requireBusiness(req);
      return evaluateCoupon(app.deps.config, req.body, app.deps.clock());
    },
  );

  app.get(
    paths.partner.coupons,
    { schema: { response: { 200: CouponListSchema } } },
    async (req) => {
      const auth = await requireBusiness(req);
      const rows = await app.deps.db
        .select()
        .from(coupons)
        .where(eq(coupons.businessId, auth.businessId))
        .orderBy(desc(coupons.createdAt))
        .limit(200);
      const now = app.deps.clock();
      return { items: await Promise.all(rows.map((row) => couponDto(app.deps.db, row, now))) };
    },
  );

  app.post(
    paths.partner.coupons,
    { schema: { body: CouponInputSchema, response: { 200: CouponSchema } } },
    async (req) => {
      const auth = await requireBusiness(req);
      const row = await createCoupon(app.deps, auth.businessId, auth.userId, req.body);
      await audit(app.deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'coupon.created',
        entityType: 'coupon',
        entityId: row.id,
        metadata: {
          code: row.code,
          approvalRoute: row.approvalRoute,
          reviewReasons: row.reviewReasons,
        },
        ip: req.ip,
      });
      return couponDto(app.deps.db, row, app.deps.clock());
    },
  );

  app.get(
    paths.partner.coupon(':couponId'),
    { schema: { params: CouponParams, response: { 200: CouponSchema } } },
    async (req) => {
      const auth = await requireBusiness(req);
      const row = await loadOwnedCoupon(app.deps.db, auth.businessId, req.params.couponId);
      return couponDto(app.deps.db, row, app.deps.clock());
    },
  );

  app.patch(
    paths.partner.coupon(':couponId'),
    { schema: { params: CouponParams, body: CouponPatchSchema, response: { 200: CouponSchema } } },
    async (req) => {
      const auth = await requireBusiness(req);
      const row = await updateCoupon(app.deps, auth.businessId, req.params.couponId, req.body);
      await audit(app.deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'coupon.updated',
        entityType: 'coupon',
        entityId: row.id,
        metadata: { approvalStatus: row.approvalStatus, reviewReasons: row.reviewReasons },
        ip: req.ip,
      });
      return couponDto(app.deps.db, row, app.deps.clock());
    },
  );

  app.post(
    paths.partner.couponCancel(':couponId'),
    { schema: { params: CouponParams, response: { 200: CouponSchema } } },
    async (req) => {
      const auth = await requireBusiness(req);
      const { db, clock } = app.deps;
      const row = await loadOwnedCoupon(db, auth.businessId, req.params.couponId);
      if (row.approvalStatus !== 'pending_approval' && row.approvalStatus !== 'approved') {
        throw conflict('coupon.not_editable', 'This coupon is already closed.');
      }
      const [updated] = await db
        .update(coupons)
        .set({ approvalStatus: 'cancelled', updatedAt: clock() })
        .where(eq(coupons.id, row.id))
        .returning();
      await audit(db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'coupon.cancelled',
        entityType: 'coupon',
        entityId: row.id,
        ip: req.ip,
      });
      return couponDto(db, updated!, clock());
    },
  );

  // --- Admin review (operations) --------------------------------------------------

  app.get(
    paths.admin.coupons,
    { schema: { querystring: AdminCouponQuery, response: { 200: AdminCouponPageSchema } } },
    async (req) => {
      await requireAdmin(req, ['operations']);
      const { db, clock } = app.deps;
      const rows = await db
        .select({ coupon: coupons, legalName: businesses.legalName })
        .from(coupons)
        .innerJoin(businesses, eq(businesses.id, coupons.businessId))
        .where(eq(coupons.approvalStatus, req.query.status))
        .orderBy(coupons.createdAt)
        .limit(100);
      const now = clock();
      const items = await Promise.all(
        rows.map(async ({ coupon, legalName }) => ({
          ...toCouponDto(coupon, await couponScope(db, coupon.id), now),
          businessLegalName: legalName,
        })),
      );
      return { items, nextCursor: null };
    },
  );

  const decide = async (
    req: FastifyRequest,
    couponId: string,
    decision: 'approved' | 'rejected',
    reason: string | null,
  ) => {
    const admin = await requireAdmin(req, ['operations']);
    const { db, clock } = app.deps;
    const now = clock();
    const [updated] = await db
      .update(coupons)
      .set({
        approvalStatus: decision,
        rejectionReason: reason,
        reviewedBy: admin.userId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(and(eq(coupons.id, couponId), inArray(coupons.approvalStatus, ['pending_approval'])))
      .returning();
    if (!updated) {
      const [exists] = await db
        .select({ id: coupons.id })
        .from(coupons)
        .where(eq(coupons.id, couponId));
      if (!exists) throw notFound('Coupon not found.');
      throw conflict('conflict', 'Only coupons waiting for approval can be reviewed.');
    }
    await audit(db, {
      actorUserId: admin.userId,
      actorType: 'admin',
      action: `coupon.${decision}`,
      entityType: 'coupon',
      entityId: updated.id,
      metadata: reason ? { reason } : {},
      ip: req.ip,
    });
    return couponDto(db, updated, now);
  };

  app.post(
    paths.admin.couponApprove(':couponId'),
    { schema: { params: CouponParams, response: { 200: CouponSchema } } },
    async (req) => decide(req, req.params.couponId, 'approved', null),
  );
  app.post(
    paths.admin.couponReject(':couponId'),
    {
      schema: {
        params: CouponParams,
        body: RejectWithReasonSchema,
        response: { 200: CouponSchema },
      },
    },
    async (req) => decide(req, req.params.couponId, 'rejected', req.body.reason),
  );
}
