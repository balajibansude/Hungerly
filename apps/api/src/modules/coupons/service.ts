import { and, eq, inArray } from 'drizzle-orm';

import type { Coupon, CouponInput, CouponPatch, CouponPolicy, CouponPreview } from '@hungerly/api-client';
import {
  couponDiscountFor,
  couponDisplayStatus,
  couponIssues,
  couponReviewMessages,
  couponReviewReasons,
  type CouponDiscountInput,
  type CouponReviewReason,
} from '@hungerly/utils';

import type { AppDeps } from '../../app';
import type { Config } from '../../config';
import type { Db } from '../../db/client';
import { branches, couponBranches, couponItems, coupons, menuItems } from '../../db/schema';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import { inr } from '../../lib/money';

export type CouponRow = typeof coupons.$inferSelect;

export function couponPolicy(config: Config): CouponPolicy {
  return {
    autoApproveMaxPercentBps: config.COUPON_AUTO_MAX_PERCENT_BPS,
    autoApproveMaxFlatMinor: config.COUPON_AUTO_MAX_FLAT_MINOR,
    autoApproveMaxCapMinor: config.COUPON_AUTO_MAX_CAP_MINOR,
    autoApproveMaxDurationDays: config.COUPON_AUTO_MAX_DURATION_DAYS,
  };
}

function rulesInput(input: CouponInput) {
  return {
    discount: input.discount as CouponDiscountInput,
    minOrderMinor: input.minOrderMinor,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
  };
}

/** Validation + approval routing, recomputed by the server on every create/update. */
export function evaluateCoupon(config: Config, input: CouponInput, now: Date): CouponPreview {
  const rules = rulesInput(input);
  const issues = couponIssues(rules, now);
  const reasons = couponReviewReasons(rules, couponPolicy(config));
  return {
    valid: issues.length === 0,
    issues,
    approvalRoute: reasons.length ? 'manual' : 'auto',
    reviewReasons: reasons.map((code) => ({ code, message: couponReviewMessages[code] })),
    exampleDiscountAtMinimum: inr(couponDiscountFor(rules.discount, input.minOrderMinor)),
  };
}

function assertValid(preview: CouponPreview): void {
  if (preview.valid) return;
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of preview.issues) (fieldErrors[issue.field] ??= []).push(issue.message);
  throw unprocessable('coupon.invalid', preview.issues[0]?.message ?? 'This coupon is not valid.', fieldErrors);
}

/** Every referenced branch and item must belong to the caller's business. */
async function assertScope(db: Db, businessId: string, branchIds: string[], menuItemIds: string[]): Promise<void> {
  if (branchIds.length) {
    const owned = await db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.businessId, businessId), inArray(branches.id, branchIds)));
    if (owned.length !== new Set(branchIds).size) throw notFound('One of the selected branches was not found.');
  }
  if (menuItemIds.length) {
    const owned = await db
      .select({ id: menuItems.id, branchId: menuItems.branchId })
      .from(menuItems)
      .innerJoin(branches, eq(branches.id, menuItems.branchId))
      .where(and(eq(branches.businessId, businessId), inArray(menuItems.id, menuItemIds)));
    if (owned.length !== new Set(menuItemIds).size) throw notFound('One of the selected menu items was not found.');
    if (branchIds.length && owned.some((item) => !branchIds.includes(item.branchId))) {
      throw unprocessable('coupon.invalid', 'Selected items must belong to the selected branches.', {
        menuItemIds: ['Item from a branch that is not selected'],
      });
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

async function assertCodeFree(db: Db, businessId: string, code: string, exceptId?: string): Promise<void> {
  const live = await db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(
        eq(coupons.businessId, businessId),
        eq(coupons.code, code),
        inArray(coupons.approvalStatus, ['pending_approval', 'approved']),
      ),
    );
  if (live.some((c) => c.id !== exceptId)) {
    throw conflict('coupon.duplicate_code', `You already have a live coupon with the code ${code}.`);
  }
}

function columnsFor(input: CouponInput, preview: CouponPreview) {
  const { discount } = input;
  return {
    code: input.code,
    title: input.title,
    description: input.description,
    discountType: discount.type,
    percentBps: discount.type === 'percent' ? discount.percentBps : null,
    maxDiscountMinor: discount.type === 'percent' ? discount.maxDiscountMinor : null,
    flatMinor: discount.type === 'flat' ? discount.amountMinor : null,
    minOrderMinor: input.minOrderMinor,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
    usageLimitTotal: input.usageLimitTotal,
    usageLimitPerCustomer: input.usageLimitPerCustomer,
    approvalRoute: preview.approvalRoute,
    // Auto-route coupons go live immediately; manual ones wait for an administrator.
    approvalStatus: preview.approvalRoute === 'auto' ? ('approved' as const) : ('pending_approval' as const),
    reviewReasons: preview.reviewReasons.map((r) => r.code),
    rejectionReason: null,
    reviewedBy: null,
    reviewedAt: null,
  };
}

/**
 * Scope rule: an empty `branchIds` means *all of the business's branches, including ones
 * added later* (no coupon_branches rows are stored). Same for `menuItemIds` (all items).
 */
export async function createCoupon(
  deps: AppDeps,
  businessId: string,
  userId: string,
  input: CouponInput,
): Promise<CouponRow> {
  const { db, clock, config } = deps;
  const now = clock();
  const preview = evaluateCoupon(config, input, now);
  assertValid(preview);
  await assertScope(db, businessId, input.branchIds, input.menuItemIds);
  await assertCodeFree(db, businessId, input.code);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(coupons)
        .values({ businessId, createdBy: userId, createdAt: now, updatedAt: now, ...columnsFor(input, preview) })
        .returning();
      await replaceScope(tx, row!.id, input);
      return row!;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('coupon.duplicate_code', `You already have a live coupon with the code ${input.code}.`);
    }
    throw error;
  }
}

async function replaceScope(db: Db, couponId: string, input: CouponInput): Promise<void> {
  await db.delete(couponBranches).where(eq(couponBranches.couponId, couponId));
  await db.delete(couponItems).where(eq(couponItems.couponId, couponId));
  const branchIds = [...new Set(input.branchIds)];
  const itemIds = [...new Set(input.menuItemIds)];
  if (branchIds.length) await db.insert(couponBranches).values(branchIds.map((branchId) => ({ couponId, branchId })));
  if (itemIds.length) await db.insert(couponItems).values(itemIds.map((menuItemId) => ({ couponId, menuItemId })));
}

export function isEditable(row: CouponRow, now: Date): boolean {
  if (row.approvalStatus === 'pending_approval') return true;
  return row.approvalStatus === 'approved' && now.getTime() < row.startsAt.getTime();
}

export async function loadOwnedCoupon(db: Db, businessId: string, couponId: string): Promise<CouponRow> {
  const [row] = await db
    .select()
    .from(coupons)
    .where(and(eq(coupons.id, couponId), eq(coupons.businessId, businessId)))
    .limit(1);
  if (!row) throw notFound('Coupon not found.');
  return row;
}

/** Edits re-run the approval rules: a bigger discount can send the coupon back for review. */
export async function updateCoupon(
  deps: AppDeps,
  businessId: string,
  couponId: string,
  patch: CouponPatch,
): Promise<CouponRow> {
  const { db, clock, config } = deps;
  const now = clock();
  const row = await loadOwnedCoupon(db, businessId, couponId);
  if (!isEditable(row, now)) {
    throw conflict('coupon.not_editable', 'Only coupons waiting for approval or not yet started can be edited.');
  }
  const scope = await couponScope(db, couponId);
  const merged: CouponInput = { ...toInput(row, scope), ...patch };
  const preview = evaluateCoupon(config, merged, now);
  assertValid(preview);
  await assertScope(db, businessId, merged.branchIds, merged.menuItemIds);
  if (merged.code !== row.code) await assertCodeFree(db, businessId, merged.code, row.id);
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(coupons)
        .set({ ...columnsFor(merged, preview), updatedAt: now })
        .where(eq(coupons.id, row.id))
        .returning();
      if (patch.branchIds !== undefined || patch.menuItemIds !== undefined) await replaceScope(tx, row.id, merged);
      return updated!;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('coupon.duplicate_code', `You already have a live coupon with the code ${merged.code}.`);
    }
    throw error;
  }
}

export async function couponScope(db: Db, couponId: string): Promise<{ branchIds: string[]; menuItemIds: string[] }> {
  const [b, i] = await Promise.all([
    db.select({ id: couponBranches.branchId }).from(couponBranches).where(eq(couponBranches.couponId, couponId)),
    db.select({ id: couponItems.menuItemId }).from(couponItems).where(eq(couponItems.couponId, couponId)),
  ]);
  return { branchIds: b.map((r) => r.id), menuItemIds: i.map((r) => r.id) };
}

function toInput(row: CouponRow, scope: { branchIds: string[]; menuItemIds: string[] }): CouponInput {
  return {
    code: row.code,
    title: row.title,
    description: row.description,
    discount:
      row.discountType === 'percent'
        ? { type: 'percent', percentBps: row.percentBps!, maxDiscountMinor: row.maxDiscountMinor }
        : { type: 'flat', amountMinor: row.flatMinor! },
    minOrderMinor: row.minOrderMinor,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    branchIds: scope.branchIds,
    menuItemIds: scope.menuItemIds,
    usageLimitTotal: row.usageLimitTotal,
    usageLimitPerCustomer: row.usageLimitPerCustomer,
  };
}

export function toCouponDto(row: CouponRow, scope: { branchIds: string[]; menuItemIds: string[] }, now: Date): Coupon {
  const input = toInput(row, scope);
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    discount: input.discount,
    minOrder: inr(row.minOrderMinor),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    branchIds: scope.branchIds,
    menuItemIds: scope.menuItemIds,
    usageLimitTotal: row.usageLimitTotal,
    usageLimitPerCustomer: row.usageLimitPerCustomer,
    approvalStatus: row.approvalStatus,
    displayStatus: couponDisplayStatus(row.approvalStatus, row.startsAt, row.endsAt, now),
    approvalRoute: row.approvalRoute,
    reviewReasons: row.reviewReasons as CouponReviewReason[],
    rejectionReason: row.rejectionReason,
    redemptions: row.redemptions,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function couponDto(db: Db, row: CouponRow, now: Date): Promise<Coupon> {
  return toCouponDto(row, await couponScope(db, row.id), now);
}
