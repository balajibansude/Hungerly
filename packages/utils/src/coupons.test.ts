import {
  couponDiscountFor,
  couponDisplayStatus,
  couponIssues,
  couponReviewReasons,
  type CouponPolicyValues,
  type CouponRulesInput,
} from './coupons';

const now = new Date('2026-10-12T06:30:00Z');
const day = 86_400_000;
const policy: CouponPolicyValues = {
  autoApproveMaxPercentBps: 3000,
  autoApproveMaxFlatMinor: 15_000,
  autoApproveMaxCapMinor: 20_000,
  autoApproveMaxDurationDays: 31,
};
const week = { startsAt: new Date(now.getTime() + day), endsAt: new Date(now.getTime() + 8 * day) };

describe('couponIssues', () => {
  it('accepts a sensible percentage coupon', () => {
    const input: CouponRulesInput = { discount: { type: 'percent', percentBps: 2000, maxDiscountMinor: 10_000 }, minOrderMinor: 29_900, ...week };
    expect(couponIssues(input, now)).toEqual([]);
  });

  it('rejects an end before the start and an end in the past', () => {
    const input: CouponRulesInput = {
      discount: { type: 'percent', percentBps: 1000, maxDiscountMinor: 5000 },
      minOrderMinor: 0,
      startsAt: new Date(now.getTime() - 3 * day),
      endsAt: new Date(now.getTime() - 4 * day),
    };
    const fields = couponIssues(input, now).map((i) => i.field);
    expect(fields).toContain('endsAt');
  });

  it('rejects flat discounts at or above the minimum order', () => {
    const issues = couponIssues({ discount: { type: 'flat', amountMinor: 20_000 }, minOrderMinor: 20_000, ...week }, now);
    expect(issues.some((i) => i.field === 'discount.amountMinor')).toBe(true);
    expect(couponIssues({ discount: { type: 'flat', amountMinor: 5000 }, minOrderMinor: 0, ...week }, now)).not.toEqual([]);
  });

  it('rejects negative minimums and out-of-range percentages', () => {
    expect(couponIssues({ discount: { type: 'percent', percentBps: 20_000, maxDiscountMinor: null }, minOrderMinor: -100, ...week }, now).length).toBeGreaterThanOrEqual(2);
  });
});

describe('couponReviewReasons', () => {
  it('auto-approves low-risk coupons', () => {
    expect(couponReviewReasons({ discount: { type: 'percent', percentBps: 2000, maxDiscountMinor: 10_000 }, minOrderMinor: 29_900, ...week }, policy)).toEqual([]);
    expect(couponReviewReasons({ discount: { type: 'flat', amountMinor: 5000 }, minOrderMinor: 29_900, ...week }, policy)).toEqual([]);
  });

  it('sends high-discount, uncapped and long coupons to an administrator', () => {
    expect(couponReviewReasons({ discount: { type: 'percent', percentBps: 5000, maxDiscountMinor: null }, minOrderMinor: 0, ...week }, policy)).toEqual([
      'percent_above_auto_limit',
      'percent_without_cap',
    ]);
    const long = { startsAt: week.startsAt, endsAt: new Date(week.startsAt.getTime() + 60 * day) };
    expect(couponReviewReasons({ discount: { type: 'flat', amountMinor: 20_000 }, minOrderMinor: 30_000, ...long }, policy)).toEqual([
      'flat_above_auto_limit',
      'flat_close_to_min_order',
      'duration_above_auto_limit',
    ]);
  });
});

describe('couponDiscountFor and couponDisplayStatus', () => {
  it('caps percentage discounts and never exceeds the subtotal', () => {
    expect(couponDiscountFor({ type: 'percent', percentBps: 2000, maxDiscountMinor: 10_000 }, 100_000)).toBe(10_000);
    expect(couponDiscountFor({ type: 'flat', amountMinor: 5000 }, 3000)).toBe(3000);
  });

  it('derives scheduled, active and expired from the window', () => {
    expect(couponDisplayStatus('approved', week.startsAt, week.endsAt, now)).toBe('scheduled');
    expect(couponDisplayStatus('approved', week.startsAt, week.endsAt, new Date(week.startsAt.getTime() + day))).toBe('active');
    expect(couponDisplayStatus('approved', week.startsAt, week.endsAt, week.endsAt)).toBe('expired');
    expect(couponDisplayStatus('pending_approval', week.startsAt, week.endsAt, now)).toBe('pending_approval');
  });
});
