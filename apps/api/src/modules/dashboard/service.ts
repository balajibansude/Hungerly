import { and, eq, gte, inArray, isNull, lt, ne, sql } from 'drizzle-orm';

import type { Dashboard } from '@hungerly/api-client';

import type { Db } from '../../db/client';
import {
  type branches,
  coupons,
  documents,
  orders,
  payoutAccounts,
  payouts,
  reviewReplies,
  reviews,
} from '../../db/schema';
import { inr } from '../../lib/money';
import { addDays, istDate, istMidnight } from '../../lib/time';

type BranchRow = typeof branches.$inferSelect;
type Action = Dashboard['pendingActions'][number];

const DOC_LABELS: Record<string, string> = {
  fssai_license: 'food licence (FSSAI)',
  bank_proof: 'bank proof',
  gst_certificate: 'GST certificate',
  pan_card: 'PAN card',
  shop_establishment: 'shop & establishment certificate',
  other: 'document',
};

/** IST calendar date of a timestamptz column, independent of the session time zone. */
const istDay = sql<string>`to_char(((${orders.placedAt} at time zone 'UTC') + interval '330 minutes')::date, 'YYYY-MM-DD')`;

export async function buildDashboard(
  db: Db,
  branch: BranchRow,
  now: Date,
  date?: string,
): Promise<Dashboard> {
  const day = date ?? istDate(now);
  const trendStart = addDays(day, -6);
  const from = istMidnight(trendStart);
  const to = istMidnight(addDays(day, 1));

  const rows = await db
    .select({
      day: istDay,
      status: orders.status,
      n: sql<number>`count(*)::int`,
      gross: sql<string>`coalesce(sum(${orders.subtotalMinor}), 0)`,
      fixtures: sql<number>`count(*) filter (where ${orders.isDevFixture})::int`,
    })
    .from(orders)
    .where(and(eq(orders.branchId, branch.id), gte(orders.placedAt, from), lt(orders.placedAt, to)))
    .groupBy(istDay, orders.status);

  const orderCounts: Dashboard['orderCounts'] = {
    placed: 0,
    preparing: 0,
    ready_for_pickup: 0,
    picked_up: 0,
    delivered: 0,
    cancelled: 0,
  };
  const trend = new Map<string, { orders: number; gross: number }>();
  for (let i = 0; i < 7; i += 1) trend.set(addDays(trendStart, i), { orders: 0, gross: 0 });
  let grossToday = 0;
  let includesDevFixtures = false;
  for (const row of rows) {
    if (row.fixtures > 0) includesDevFixtures = true;
    const counted = row.status !== 'cancelled' && row.status !== 'pending_payment';
    const bucket = trend.get(row.day);
    if (bucket && counted) {
      bucket.orders += row.n;
      bucket.gross += Number(row.gross);
    }
    if (row.day === day) {
      if (row.status in orderCounts) orderCounts[row.status as keyof typeof orderCounts] += row.n;
      if (counted) grossToday += Number(row.gross);
    }
  }

  return {
    branchId: branch.id,
    date: day,
    orderCounts,
    grossSalesToday: inr(grossToday),
    trend: [...trend.entries()].map(([d, v]) => ({
      date: d,
      orders: v.orders,
      grossSales: inr(v.gross),
    })),
    pendingActions: await pendingActions(db, branch, now),
    includesDevFixtures,
  };
}

async function pendingActions(db: Db, branch: BranchRow, now: Date): Promise<Action[]> {
  const actions: Action[] = [];
  if (branch.status === 'draft') {
    actions.push({
      kind: 'onboarding_incomplete',
      message: 'Finish onboarding and submit this branch for review.',
    });
  } else if (branch.status === 'rejected') {
    actions.push({
      kind: 'onboarding_incomplete',
      message: `This branch was not approved${branch.statusReason ? `: ${branch.statusReason}` : '.'} Fix the details and resubmit.`,
    });
  }

  const docs = await db
    .select({
      type: documents.type,
      status: documents.status,
      expiresOn: documents.expiresOn,
      reason: documents.rejectionReason,
    })
    .from(documents)
    .where(and(eq(documents.branchId, branch.id), ne(documents.status, 'superseded')));
  const today = istDate(now);
  const soon = addDays(today, 30);
  for (const doc of docs) {
    const label = DOC_LABELS[doc.type] ?? 'document';
    if (doc.status === 'rejected') {
      actions.push({
        kind: 'document_rejected',
        message: `Your ${label} was rejected${doc.reason ? `: ${doc.reason}` : '.'} Upload a new one.`,
      });
    } else if (
      doc.status === 'expired' ||
      (doc.status === 'approved' && doc.expiresOn && doc.expiresOn < today)
    ) {
      actions.push({
        kind: 'document_expiring',
        message: `Your ${label} has expired. Upload the renewed one.`,
      });
    } else if (doc.status === 'pending_review') {
      actions.push({
        kind: 'document_pending',
        message: `Your ${label} is waiting for Swaadone review.`,
      });
    } else if (doc.status === 'approved' && doc.expiresOn && doc.expiresOn <= soon) {
      actions.push({
        kind: 'document_expiring',
        message: `Your ${label} expires on ${doc.expiresOn}. Upload the renewal before then.`,
      });
    }
  }

  const [account] = await db
    .select({ status: payoutAccounts.status })
    .from(payoutAccounts)
    .where(and(eq(payoutAccounts.branchId, branch.id), eq(payoutAccounts.isCurrent, true)))
    .limit(1);
  if (!account) {
    actions.push({
      kind: 'payout_account_missing',
      message: 'Add a bank account to receive payouts.',
    });
  } else if (account.status !== 'verified') {
    actions.push({
      kind: 'payout_account_unverified',
      message:
        account.status === 'failed'
          ? 'Your bank account could not be verified. Add a correct account.'
          : 'Your bank account is being verified.',
    });
  }

  const [failed] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payouts)
    .where(
      and(
        eq(payouts.branchId, branch.id),
        inArray(payouts.status, ['failed', 'reversed', 'rejected']),
        gte(payouts.updatedAt, new Date(now.getTime() - 7 * 86_400_000)),
      ),
    );
  if ((failed?.n ?? 0) > 0) {
    actions.push({
      kind: 'payout_failed',
      message: 'A payout did not go through. The amount is back in your wallet.',
    });
  }

  const [waiting] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(eq(orders.branchId, branch.id), eq(orders.status, 'placed')));
  if ((waiting?.n ?? 0) > 0) {
    actions.push({
      kind: 'orders_waiting',
      message: `${waiting!.n} new ${waiting!.n === 1 ? 'order is' : 'orders are'} waiting to be accepted.`,
    });
  }

  const [unanswered] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .leftJoin(reviewReplies, eq(reviewReplies.reviewId, reviews.id))
    .where(
      and(
        eq(reviews.branchId, branch.id),
        ne(reviews.moderationStatus, 'hidden'),
        isNull(reviewReplies.id),
      ),
    );
  if ((unanswered?.n ?? 0) > 0) {
    actions.push({
      kind: 'reviews_unanswered',
      message: `${unanswered!.n} ${unanswered!.n === 1 ? 'review has' : 'reviews have'} no reply yet.`,
    });
  }

  // Rejected coupons that apply to this branch (no branch list = all branches).
  const rejectedCoupons = await db
    .select({ code: coupons.code })
    .from(coupons)
    .where(
      and(
        eq(coupons.businessId, branch.businessId),
        eq(coupons.approvalStatus, 'rejected'),
        gte(coupons.reviewedAt, new Date(now.getTime() - 14 * 86_400_000)),
        sql`(not exists (select 1 from coupon_branches cb where cb.coupon_id = ${coupons.id})
             or exists (select 1 from coupon_branches cb where cb.coupon_id = ${coupons.id} and cb.branch_id = ${branch.id}))`,
      ),
    );
  for (const { code } of rejectedCoupons) {
    actions.push({
      kind: 'coupon_rejected',
      message: `Coupon ${code} was not approved. See the reason in Offers.`,
    });
  }
  return actions;
}
