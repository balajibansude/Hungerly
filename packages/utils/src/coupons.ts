/**
 * Restaurant coupon rules, shared by the API (authoritative) and the app (live preview).
 *
 * Two separate questions:
 * 1. Is the coupon valid at all? (`couponIssues`) — invalid coupons are refused.
 * 2. Can it go live automatically, or must an administrator approve it?
 *    (`couponReviewReasons`) — thresholds come from the server's configured policy, never
 *    from the client, and the server recomputes them on every create/update.
 */

export type CouponDiscountInput =
  | { type: 'percent'; percentBps: number; maxDiscountMinor: number | null }
  | { type: 'flat'; amountMinor: number };

export interface CouponRulesInput {
  discount: CouponDiscountInput;
  minOrderMinor: number;
  startsAt: Date;
  endsAt: Date;
}

export interface CouponPolicyValues {
  autoApproveMaxPercentBps: number;
  autoApproveMaxFlatMinor: number;
  autoApproveMaxCapMinor: number;
  autoApproveMaxDurationDays: number;
}

export interface CouponIssue {
  field: string;
  message: string;
}

export type CouponReviewReason =
  | 'percent_above_auto_limit'
  | 'flat_above_auto_limit'
  | 'percent_without_cap'
  | 'cap_above_auto_limit'
  | 'duration_above_auto_limit'
  | 'flat_close_to_min_order';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Coupons can be scheduled at most a year ahead and run at most a year. */
const MAX_LEAD_DAYS = 365;
const MAX_DURATION_DAYS = 365;

export function couponIssues(input: CouponRulesInput, now: Date): CouponIssue[] {
  const issues: CouponIssue[] = [];
  const { discount } = input;
  if (discount.type === 'percent') {
    if (discount.percentBps < 100 || discount.percentBps > 10_000) {
      issues.push({ field: 'discount.percentBps', message: 'Choose a discount between 1% and 100%.' });
    }
    if (discount.maxDiscountMinor !== null && discount.maxDiscountMinor < 100) {
      issues.push({ field: 'discount.maxDiscountMinor', message: 'The cap must be at least ₹1.' });
    }
  } else {
    if (discount.amountMinor < 100) {
      issues.push({ field: 'discount.amountMinor', message: 'The discount must be at least ₹1.' });
    }
    if (input.minOrderMinor > 0 && discount.amountMinor >= input.minOrderMinor) {
      issues.push({
        field: 'discount.amountMinor',
        message: 'A flat discount must be smaller than the minimum order value.',
      });
    }
    if (input.minOrderMinor === 0) {
      issues.push({
        field: 'minOrderMinor',
        message: 'Flat discounts need a minimum order value above the discount.',
      });
    }
  }
  if (input.minOrderMinor < 0) {
    issues.push({ field: 'minOrderMinor', message: 'The minimum order cannot be negative.' });
  }
  if (Number.isNaN(input.startsAt.getTime()) || Number.isNaN(input.endsAt.getTime())) {
    issues.push({ field: 'startsAt', message: 'Enter valid start and end times.' });
    return issues;
  }
  if (input.endsAt.getTime() <= input.startsAt.getTime()) {
    issues.push({ field: 'endsAt', message: 'The end must be after the start.' });
  }
  if (input.endsAt.getTime() <= now.getTime()) {
    issues.push({ field: 'endsAt', message: 'The end time has already passed.' });
  }
  if (input.startsAt.getTime() - now.getTime() > MAX_LEAD_DAYS * DAY_MS) {
    issues.push({ field: 'startsAt', message: 'Coupons can be scheduled up to a year ahead.' });
  }
  if (input.endsAt.getTime() - input.startsAt.getTime() > MAX_DURATION_DAYS * DAY_MS) {
    issues.push({ field: 'endsAt', message: 'A coupon can run for at most a year.' });
  }
  return issues;
}

export const couponReviewMessages: Record<CouponReviewReason, string> = {
  percent_above_auto_limit: 'The percentage is above the limit for automatic approval.',
  flat_above_auto_limit: 'The flat discount is above the limit for automatic approval.',
  percent_without_cap: 'Percentage coupons without a maximum discount need approval.',
  cap_above_auto_limit: 'The maximum discount is above the limit for automatic approval.',
  duration_above_auto_limit: 'The coupon runs longer than automatic approval allows.',
  flat_close_to_min_order: 'The flat discount is more than half the minimum order value.',
};

export function couponReviewReasons(
  input: CouponRulesInput,
  policy: CouponPolicyValues,
): CouponReviewReason[] {
  const reasons: CouponReviewReason[] = [];
  const { discount } = input;
  if (discount.type === 'percent') {
    if (discount.percentBps > policy.autoApproveMaxPercentBps) reasons.push('percent_above_auto_limit');
    if (discount.maxDiscountMinor === null) reasons.push('percent_without_cap');
    else if (discount.maxDiscountMinor > policy.autoApproveMaxCapMinor) reasons.push('cap_above_auto_limit');
  } else {
    if (discount.amountMinor > policy.autoApproveMaxFlatMinor) reasons.push('flat_above_auto_limit');
    if (discount.amountMinor * 2 > input.minOrderMinor) reasons.push('flat_close_to_min_order');
  }
  const durationDays = (input.endsAt.getTime() - input.startsAt.getTime()) / DAY_MS;
  if (durationDays > policy.autoApproveMaxDurationDays) reasons.push('duration_above_auto_limit');
  return reasons;
}

/** Discount on an order of `subtotalMinor` (no eligibility checks). */
export function couponDiscountFor(discount: CouponDiscountInput, subtotalMinor: number): number {
  if (discount.type === 'flat') return Math.min(discount.amountMinor, subtotalMinor);
  const raw = Math.floor((subtotalMinor * discount.percentBps) / 10_000);
  return discount.maxDiscountMinor === null ? raw : Math.min(raw, discount.maxDiscountMinor);
}

export type CouponDisplayStatus =
  'pending_approval' | 'scheduled' | 'active' | 'expired' | 'rejected' | 'cancelled';

export function couponDisplayStatus(
  approvalStatus: 'pending_approval' | 'approved' | 'rejected' | 'cancelled',
  startsAt: Date,
  endsAt: Date,
  now: Date,
): CouponDisplayStatus {
  if (approvalStatus !== 'approved') return approvalStatus;
  if (now.getTime() < startsAt.getTime()) return 'scheduled';
  if (now.getTime() >= endsAt.getTime()) return 'expired';
  return 'active';
}
