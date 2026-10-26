import { and, eq, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';

import type { Review, ReviewSummary } from '@hungerly/api-client';

import type { Db } from '../../db/client';
import { orders, reviewReplies, reviewReports, reviews } from '../../db/schema';
import { badRequest, notFound } from '../../lib/errors';
import { firstName } from '../orders/service';

type ReviewRow = typeof reviews.$inferSelect;
export type ReviewSort = 'newest' | 'oldest' | 'lowest' | 'highest';

/** Hidden reviews (moderation) are never shown to restaurants. */
const visible = (branchId: string) =>
  and(eq(reviews.branchId, branchId), ne(reviews.moderationStatus, 'hidden'));

export async function requireBranchReview(
  db: Db,
  branchId: string,
  reviewId: string,
): Promise<ReviewRow> {
  const [row] = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), visible(branchId)))
    .limit(1);
  if (!row) throw notFound('Review not found.');
  return row;
}

export async function toReviewDtos(
  db: Db,
  rows: ReviewRow[],
  editHours: number,
): Promise<Review[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const orderIds = rows.map((r) => r.orderId).filter((id): id is string => !!id);
  const [replies, reports, orderRows] = await Promise.all([
    db.select().from(reviewReplies).where(inArray(reviewReplies.reviewId, ids)),
    db
      .select({ reviewId: reviewReports.reviewId })
      .from(reviewReports)
      .where(and(inArray(reviewReports.reviewId, ids), eq(reviewReports.status, 'open'))),
    orderIds.length
      ? db
          .select({ id: orders.id, orderNumber: orders.orderNumber })
          .from(orders)
          .where(inArray(orders.id, orderIds))
      : Promise.resolve([]),
  ]);
  return rows.map((r) => {
    const reply = replies.find((x) => x.reviewId === r.id);
    return {
      id: r.id,
      branchId: r.branchId,
      rating: r.rating,
      comment: r.comment,
      customerName: firstName(r.customerDisplayName),
      orderNumber: orderRows.find((o) => o.id === r.orderId)?.orderNumber ?? null,
      createdAt: r.createdAt.toISOString(),
      reply: reply
        ? {
            body: reply.body,
            createdAt: reply.createdAt.toISOString(),
            updatedAt: reply.updatedAt.toISOString(),
            editableUntil: new Date(
              reply.createdAt.getTime() + editHours * 3_600_000,
            ).toISOString(),
          }
        : null,
      reported: reports.some((x) => x.reviewId === r.id),
      isDevFixture: r.isDevFixture,
    };
  });
}

/** Keyset paging; the cursor holds the sort key of the last row plus its id. */
export async function listReviews(
  db: Db,
  branchId: string,
  query: {
    rating?: number;
    replied?: 'yes' | 'no';
    sort: ReviewSort;
    cursor: { k: string | number; i: string } | null;
    limit: number;
  },
) {
  const filters: (SQL | undefined)[] = [visible(branchId)];
  if (query.rating) filters.push(eq(reviews.rating, query.rating));
  if (query.replied === 'yes')
    filters.push(sql`exists (select 1 from review_replies rr where rr.review_id = ${reviews.id})`);
  if (query.replied === 'no')
    filters.push(
      sql`not exists (select 1 from review_replies rr where rr.review_id = ${reviews.id})`,
    );

  // Sort key: created_at for date sorts, (rating, created_at) collapsed into rating then id for rating sorts.
  const byDate = query.sort === 'newest' || query.sort === 'oldest';
  const desc = query.sort === 'newest' || query.sort === 'highest';
  const key = byDate ? sql`${reviews.createdAt}` : sql`${reviews.rating}`;
  if (query.cursor) {
    const valid =
      typeof query.cursor.i === 'string' &&
      /^[0-9a-f-]{36}$/.test(query.cursor.i) &&
      (byDate
        ? !Number.isNaN(Date.parse(String(query.cursor.k)))
        : Number.isInteger(Number(query.cursor.k)));
    if (!valid) throw badRequest('validation', 'Invalid cursor.');
    const value = byDate
      ? sql`${new Date(String(query.cursor.k)).toISOString()}::timestamptz`
      : sql`${Number(query.cursor.k)}::int`;
    const id = sql`${query.cursor.i}::uuid`;
    filters.push(
      desc
        ? sql`(${key}, ${reviews.id}) < (${value}, ${id})`
        : sql`(${key}, ${reviews.id}) > (${value}, ${id})`,
    );
  }
  const direction = desc ? sql`desc` : sql`asc`;
  const rows = await db
    .select()
    .from(reviews)
    .where(and(...filters))
    .orderBy(sql`${key} ${direction}`, sql`${reviews.id} ${direction}`)
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    rows: page,
    next:
      rows.length > query.limit && last
        ? { k: byDate ? last.createdAt.toISOString() : last.rating, i: last.id }
        : null,
  };
}

export async function reviewSummary(db: Db, branchId: string): Promise<ReviewSummary> {
  const counts = await db
    .select({ rating: reviews.rating, n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(visible(branchId))
    .groupBy(reviews.rating);
  const [unanswered] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .leftJoin(reviewReplies, eq(reviewReplies.reviewId, reviews.id))
    .where(and(visible(branchId), isNull(reviewReplies.id)));
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewSummary['distribution'];
  let total = 0;
  let sum = 0;
  for (const row of counts) {
    distribution[row.rating as 1 | 2 | 3 | 4 | 5] = row.n;
    total += row.n;
    sum += row.rating * row.n;
  }
  return {
    average: total ? Math.round((sum / total) * 10) / 10 : null,
    count: total,
    distribution,
    unanswered: unanswered?.n ?? 0,
  };
}
