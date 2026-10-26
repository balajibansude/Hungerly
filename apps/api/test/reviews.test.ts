import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { reviews } from '../src/db/schema';
import {
  call,
  createActiveBranch,
  createTestContext,
  signInOwner,
  type TestContext,
} from './harness';

let ctx: TestContext;
let owner: Awaited<ReturnType<typeof signInOwner>>;
let branchId: string;
let reviewIds: string[];

type Page = {
  items: {
    id: string;
    rating: number;
    customerName: string;
    reply: { body: string } | null;
    reported: boolean;
  }[];
  nextCursor: string | null;
};

beforeAll(async () => {
  ctx = await createTestContext();
  owner = await signInOwner(ctx);
  ({
    branch: { id: branchId },
  } = await createActiveBranch(ctx, owner.userId));
  const rows = await ctx.db
    .insert(reviews)
    .values(
      [5, 4, 2, 1, 5].map((rating, i) => ({
        branchId,
        rating,
        comment: `Comment ${i}`,
        customerDisplayName: 'Priya Sharma',
        createdAt: new Date(ctx.clock.now.getTime() - (i + 1) * 3_600_000),
      })),
    )
    .returning({ id: reviews.id });
  reviewIds = rows.map((r) => r.id);
  // A moderated (hidden) review is never shown to the restaurant.
  await ctx.db
    .insert(reviews)
    .values({
      branchId,
      rating: 1,
      comment: 'abusive',
      customerDisplayName: 'X',
      moderationStatus: 'hidden',
    });
});
afterAll(async () => {
  await ctx.close();
});

describe('reviews', () => {
  it('summarises visible reviews only', async () => {
    const res = await call<{
      average: number;
      count: number;
      distribution: Record<string, number>;
      unanswered: number;
    }>(ctx, 'GET', `/partner/branches/${branchId}/reviews/summary`, { token: owner.token });
    expect(res.body).toEqual({
      average: 3.4,
      count: 5,
      distribution: { 1: 1, 2: 1, 3: 0, 4: 1, 5: 2 },
      unanswered: 5,
    });
  });

  it('lists with filters, sorting and a cursor, showing first names only', async () => {
    const lowest = await call<Page>(
      ctx,
      'GET',
      `/partner/branches/${branchId}/reviews?sort=lowest&limit=2`,
      { token: owner.token },
    );
    expect(lowest.body.items.map((r) => r.rating)).toEqual([1, 2]);
    expect(lowest.body.items[0]!.customerName).toBe('Priya');
    const next = await call<Page>(
      ctx,
      'GET',
      `/partner/branches/${branchId}/reviews?sort=lowest&limit=2&cursor=${lowest.body.nextCursor}`,
      {
        token: owner.token,
      },
    );
    expect(next.body.items.map((r) => r.rating)).toEqual([4, 5]);
    const fives = await call<Page>(ctx, 'GET', `/partner/branches/${branchId}/reviews?rating=5`, {
      token: owner.token,
    });
    expect(fives.body.items).toHaveLength(2);
    const newest = await call<Page>(ctx, 'GET', `/partner/branches/${branchId}/reviews?limit=3`, {
      token: owner.token,
    });
    const older = await call<Page>(
      ctx,
      'GET',
      `/partner/branches/${branchId}/reviews?limit=3&cursor=${newest.body.nextCursor}`,
      { token: owner.token },
    );
    expect([...newest.body.items, ...older.body.items].map((r) => r.id)).toEqual(reviewIds);
  });

  it('replies, edits within the window, then locks the reply', async () => {
    const url = `/partner/branches/${branchId}/reviews/${reviewIds[2]}/reply`;
    const first = await call<Page['items'][number]>(ctx, 'PUT', url, {
      token: owner.token,
      body: { body: 'Sorry about that!' },
    });
    expect(first.status).toBe(200);
    expect(first.body.reply?.body).toBe('Sorry about that!');
    const edit = await call<Page['items'][number]>(ctx, 'PUT', url, {
      token: owner.token,
      body: { body: 'Sorry — we have fixed it.' },
    });
    expect(edit.body.reply?.body).toBe('Sorry — we have fixed it.');
    ctx.clock.advance((ctx.config.REVIEW_REPLY_EDIT_HOURS + 1) * 3_600_000);
    const late = await call<{ code: string }>(ctx, 'PUT', url, {
      token: owner.token,
      body: { body: 'Too late' },
    });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('review.reply_not_editable');
    const replied = await call<Page>(
      ctx,
      'GET',
      `/partner/branches/${branchId}/reviews?replied=yes`,
      { token: owner.token },
    );
    expect(replied.body.items.map((r) => r.id)).toEqual([reviewIds[2]]);
  });

  it('never lets the owner change the rating or comment', async () => {
    const url = `/partner/branches/${branchId}/reviews/${reviewIds[3]}/reply`;
    await call(ctx, 'PUT', url, {
      token: owner.token,
      body: { body: 'Thanks', rating: 5, comment: 'Great!' },
    });
    const [row] = await ctx.db.select().from(reviews).where(eq(reviews.id, reviewIds[3]!));
    expect(row).toMatchObject({ rating: 1, comment: 'Comment 3' });
    for (const method of ['PATCH', 'PUT', 'DELETE'] as const) {
      const res = await call(ctx, method, `/partner/branches/${branchId}/reviews/${reviewIds[3]}`, {
        token: owner.token,
        body: { rating: 5 },
      });
      expect(res.status).toBe(404);
    }
  });

  it('reports a review once while the report is open', async () => {
    const url = `/partner/branches/${branchId}/reviews/${reviewIds[4]}/report`;
    expect(
      (await call(ctx, 'POST', url, { token: owner.token, body: { reason: 'spam', note: null } }))
        .status,
    ).toBe(200);
    const again = await call(ctx, 'POST', url, {
      token: owner.token,
      body: { reason: 'spam', note: null },
    });
    expect(again.status).toBe(409);
  });

  it('replies are limited to branches the owner manages', async () => {
    const intruder = await signInOwner(ctx);
    const { branch: own } = await createActiveBranch(ctx, intruder.userId, { name: 'Other' });
    const direct = await call(
      ctx,
      'PUT',
      `/partner/branches/${branchId}/reviews/${reviewIds[0]}/reply`,
      {
        token: intruder.token,
        body: { body: 'Hijack' },
      },
    );
    expect(direct.status).toBe(404);
    // Using their own branch id with someone else's review id is also refused.
    const crossed = await call(
      ctx,
      'PUT',
      `/partner/branches/${own.id}/reviews/${reviewIds[0]}/reply`,
      {
        token: intruder.token,
        body: { body: 'Hijack' },
      },
    );
    expect(crossed.status).toBe(404);
    expect(
      (await call(ctx, 'GET', `/partner/branches/${branchId}/reviews`, { token: intruder.token }))
        .status,
    ).toBe(404);
  });
});
