import { CouponInputSchema, type Coupon, type CouponDisplayStatus, type CouponInput } from '@hungerly/api-client';
import type { BadgeTone } from '@hungerly/ui';
import { IST_UTC_OFFSET_MINUTES } from '@hungerly/utils';

import { paiseToRupeesInput, rupeesToPaise } from '@/features/wallet/format';

/** Coupon form as typed (strings), and its mapping to the API's `CouponInput`. */
export interface CouponForm {
  code: string;
  title: string;
  description: string;
  type: 'percent' | 'flat';
  /** Percent, e.g. "15" or "12.5". */
  percent: string;
  /** Rupees; empty = no cap. */
  maxDiscount: string;
  /** Rupees. */
  flatAmount: string;
  /** Rupees. */
  minOrder: string;
  /** IST "YYYY-MM-DD" and "HH:MM". */
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  branchIds: string[];
  menuItemIds: string[];
  usageLimitTotal: string;
  usageLimitPerCustomer: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function istParts(at: Date): { date: string; time: string } {
  const shifted = new Date(at.getTime() + IST_UTC_OFFSET_MINUTES * 60_000);
  return {
    date: shifted.toISOString().slice(0, 10),
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

/** IST date + time → ISO instant with offset, or null if malformed. */
export function istToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  // Reject impossible calendar dates such as 2026-02-30 (Date would roll them over).
  const midnight = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date) return null;
  return `${date}T${time}:00+05:30`;
}

export function emptyCouponForm(now: Date): CouponForm {
  const start = istParts(new Date(now.getTime() + 60 * 60_000));
  const end = istParts(new Date(now.getTime() + 7 * 86_400_000));
  return {
    code: '',
    title: '',
    description: '',
    type: 'percent',
    percent: '10',
    maxDiscount: '100',
    flatAmount: '',
    minOrder: '199',
    startDate: start.date,
    startTime: `${start.time.slice(0, 2)}:00`,
    endDate: end.date,
    endTime: '23:59',
    branchIds: [],
    menuItemIds: [],
    usageLimitTotal: '',
    usageLimitPerCustomer: '1',
  };
}

export function formFromCoupon(coupon: Coupon): CouponForm {
  const start = istParts(new Date(coupon.startsAt));
  const end = istParts(new Date(coupon.endsAt));
  return {
    code: coupon.code,
    title: coupon.title,
    description: coupon.description,
    type: coupon.discount.type,
    percent: coupon.discount.type === 'percent' ? String(coupon.discount.percentBps / 100) : '10',
    maxDiscount:
      coupon.discount.type === 'percent' && coupon.discount.maxDiscountMinor !== null
        ? paiseToRupeesInput(coupon.discount.maxDiscountMinor)
        : '',
    flatAmount: coupon.discount.type === 'flat' ? paiseToRupeesInput(coupon.discount.amountMinor) : '',
    minOrder: paiseToRupeesInput(coupon.minOrder.amountMinor),
    startDate: start.date,
    startTime: start.time,
    endDate: end.date,
    endTime: end.time,
    branchIds: coupon.branchIds,
    menuItemIds: coupon.menuItemIds,
    usageLimitTotal: coupon.usageLimitTotal === null ? '' : String(coupon.usageLimitTotal),
    usageLimitPerCustomer: coupon.usageLimitPerCustomer === null ? '' : String(coupon.usageLimitPerCustomer),
  };
}

function optionalCount(value: string): number | null | 'invalid' {
  if (value.trim() === '') return null;
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : 'invalid';
}

/** "12.5" → 1250 basis points; null if not a number with up to 2 decimals. */
export function percentToBps(value: string): number | null {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole = '0', fraction = ''] = value.trim().split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export type CouponFormResult = { ok: true; input: CouponInput } | { ok: false; errors: Record<string, string> };

/**
 * Validates the form shape and builds the request. Business rules (dates, limits,
 * approval) are checked by the server's preview; this only catches what cannot be sent.
 */
export function toCouponInput(form: CouponForm): CouponFormResult {
  const errors: Record<string, string> = {};
  const minOrderMinor = rupeesToPaise(form.minOrder || '0');
  if (minOrderMinor === null) errors.minOrderMinor = 'Enter the minimum order in rupees.';

  let discount: CouponInput['discount'] | null = null;
  if (form.type === 'percent') {
    const percentBps = percentToBps(form.percent);
    const cap = form.maxDiscount.trim() === '' ? null : rupeesToPaise(form.maxDiscount);
    if (percentBps === null) errors['discount.percentBps'] = 'Enter a percentage, like 15.';
    if (form.maxDiscount.trim() !== '' && cap === null) errors['discount.maxDiscountMinor'] = 'Enter the cap in rupees.';
    if (percentBps !== null && (form.maxDiscount.trim() === '' || cap !== null)) {
      discount = { type: 'percent', percentBps, maxDiscountMinor: cap };
    }
  } else {
    const amountMinor = rupeesToPaise(form.flatAmount);
    if (amountMinor === null) errors['discount.amountMinor'] = 'Enter the discount in rupees.';
    else discount = { type: 'flat', amountMinor };
  }

  const startsAt = istToIso(form.startDate, form.startTime);
  const endsAt = istToIso(form.endDate, form.endTime);
  if (!startsAt) errors.startsAt = 'Use a date like 2026-10-15 and a time like 18:00.';
  if (!endsAt) errors.endsAt = 'Use a date like 2026-10-31 and a time like 23:59.';

  const usageLimitTotal = optionalCount(form.usageLimitTotal);
  const usageLimitPerCustomer = optionalCount(form.usageLimitPerCustomer);
  if (usageLimitTotal === 'invalid') errors.usageLimitTotal = 'Enter a whole number, or leave empty for no limit.';
  if (usageLimitPerCustomer === 'invalid') errors.usageLimitPerCustomer = 'Enter a whole number, or leave empty for no limit.';

  if (Object.keys(errors).length > 0 || !discount || !startsAt || !endsAt || minOrderMinor === null) {
    return { ok: false, errors };
  }
  const parsed = CouponInputSchema.safeParse({
    code: form.code,
    title: form.title,
    description: form.description,
    discount,
    minOrderMinor,
    startsAt,
    endsAt,
    branchIds: form.branchIds,
    menuItemIds: form.menuItemIds,
    usageLimitTotal,
    usageLimitPerCustomer,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }
  return { ok: true, input: parsed.data };
}

export const couponStatusMeta: Record<CouponDisplayStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Live', tone: 'success' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  pending_approval: { label: 'Waiting for Swaadone approval', tone: 'warning' },
  rejected: { label: 'Not approved', tone: 'error' },
  expired: { label: 'Ended', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const COUPON_FILTERS: { key: CouponDisplayStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Live' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'pending_approval', label: 'In review' },
  { key: 'rejected', label: 'Not approved' },
  { key: 'expired', label: 'Ended' },
  { key: 'cancelled', label: 'Cancelled' },
];

/** "15% off up to ₹100" / "₹50 off". */
export function describeDiscount(discount: CouponInput['discount'], format: (minor: number) => string): string {
  if (discount.type === 'flat') return `${format(discount.amountMinor)} off`;
  const pct = discount.percentBps % 100 === 0 ? String(discount.percentBps / 100) : (discount.percentBps / 100).toFixed(2);
  return discount.maxDiscountMinor === null ? `${pct}% off` : `${pct}% off up to ${format(discount.maxDiscountMinor)}`;
}

/** Can the owner still edit this coupon? Mirrors the server rule; the server decides. */
export function canEditCoupon(coupon: Pick<Coupon, 'displayStatus'>): boolean {
  return coupon.displayStatus === 'pending_approval' || coupon.displayStatus === 'scheduled';
}

export function canCancelCoupon(coupon: Pick<Coupon, 'displayStatus'>): boolean {
  return coupon.displayStatus === 'pending_approval' || coupon.displayStatus === 'scheduled' || coupon.displayStatus === 'active';
}
