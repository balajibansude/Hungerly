import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  OkSchema,
  paths,
  ReplyToReviewSchema,
  ReportReviewSchema,
  ReviewListQuerySchema,
  ReviewPageSchema,
  ReviewSchema,
  ReviewSummarySchema,
} from '@hungerly/api-client';

import { requireOwnedBranch } from '../../auth/guard';
import { reviewReplies, reviewReports } from '../../db/schema';
import { audit } from '../../lib/audit';
import { conflict } from '../../lib/errors';
import { decodeCursor, encodeCursor } from '../../lib/pagination';
import { listReviews, requireBranchReview, reviewSummary, toReviewDtos } from './service';

const BranchParams = z.object({ branchId: z.uuid() });
const ReviewParams = BranchParams.extend({ reviewId: z.uuid() });

/**
 * Ratings and reviews for one branch. Owners can reply (and edit the reply for a limited
 * time) and report a review to moderation. Ratings and comments are customer-owned:
 * there is deliberately no endpoint that changes them.
 */
export async function reviewRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();
  const { deps } = app;
  const editHours = () => deps.config.REVIEW_REPLY_EDIT_HOURS;

  app.get(
    paths.partner.reviews(':branchId'),
    {
      schema: {
        params: BranchParams,
        querystring: ReviewListQuerySchema,
        response: { 200: ReviewPageSchema },
      },
    },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      const cursor = decodeCursor<{ k: string | number; i: string }>(req.query.cursor);
      const { rows, next } = await listReviews(deps.db, branch.id, { ...req.query, cursor });
      return {
        items: await toReviewDtos(deps.db, rows, editHours()),
        nextCursor: next ? encodeCursor(next) : null,
      };
    },
  );

  app.get(
    paths.partner.reviewSummary(':branchId'),
    { schema: { params: BranchParams, response: { 200: ReviewSummarySchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      return reviewSummary(deps.db, branch.id);
    },
  );

  // POST is an alias of PUT for app compatibility: both create the reply or edit it in the window.
  app.route({
    method: ['PUT', 'POST'],
    url: paths.partner.reviewReply(':branchId', ':reviewId'),
    schema: { params: ReviewParams, body: ReplyToReviewSchema, response: { 200: ReviewSchema } },
    handler: async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const review = await requireBranchReview(deps.db, branch.id, req.params.reviewId);
      const now = deps.clock();
      const [existing] = await deps.db
        .select()
        .from(reviewReplies)
        .where(eq(reviewReplies.reviewId, review.id))
        .limit(1);
      if (existing) {
        if (now.getTime() > existing.createdAt.getTime() + editHours() * 3_600_000) {
          throw conflict(
            'review.reply_not_editable',
            `Replies can be edited for ${editHours()} hours after posting.`,
          );
        }
        await deps.db
          .update(reviewReplies)
          .set({ body: req.body.body, updatedAt: now })
          .where(eq(reviewReplies.id, existing.id));
      } else {
        await deps.db
          .insert(reviewReplies)
          .values({
            reviewId: review.id,
            body: req.body.body,
            authorUserId: auth.userId,
            createdAt: now,
            updatedAt: now,
          });
      }
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: existing ? 'review.reply_edited' : 'review.replied',
        entityType: 'review',
        entityId: review.id,
        branchId: branch.id,
        ip: req.ip,
      });
      return (await toReviewDtos(deps.db, [review], editHours()))[0]!;
    },
  });

  app.post(
    paths.partner.reviewReport(':branchId', ':reviewId'),
    { schema: { params: ReviewParams, body: ReportReviewSchema, response: { 200: OkSchema } } },
    async (req) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const review = await requireBranchReview(deps.db, branch.id, req.params.reviewId);
      const [open] = await deps.db
        .select({ id: reviewReports.id })
        .from(reviewReports)
        .where(and(eq(reviewReports.reviewId, review.id), eq(reviewReports.status, 'open')))
        .limit(1);
      if (open)
        throw conflict('conflict', 'This review has already been reported and is being looked at.');
      const inserted = await deps.db
        .insert(reviewReports)
        .values({
          reviewId: review.id,
          reportedBy: auth.userId,
          reason: req.body.reason,
          note: req.body.note,
        })
        .onConflictDoNothing()
        .returning({ id: reviewReports.id });
      if (inserted.length === 0)
        throw conflict('conflict', 'This review has already been reported and is being looked at.');
      await audit(deps.db, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'review.reported',
        entityType: 'review',
        entityId: review.id,
        branchId: branch.id,
        metadata: { reason: req.body.reason },
        ip: req.ip,
      });
      return { ok: true as const };
    },
  );
}
