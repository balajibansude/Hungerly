import { and, asc, eq, gt, or, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  AdminBranchPageSchema,
  AdminBranchSchema,
  AdminDocumentPageSchema,
  AdminDocumentSchema,
  ApproveBranchSchema,
  BranchStatusSchema,
  DocumentStatusSchema,
  IdSchema,
  PageQuerySchema,
  paths,
  RejectWithReasonSchema,
} from '@hungerly/api-client';

import { requireAdmin } from '../../auth/guard';
import { branches, businesses, documents, users } from '../../db/schema';
import { audit } from '../../lib/audit';
import { conflict, notFound, unprocessable } from '../../lib/errors';
import { decodeCursor, encodeCursor } from '../../lib/pagination';
import { approvalBlockers, type BranchRow } from '../branches/service';
import { sendDocumentFile } from '../documents/routes';
import { isExpired, toDocumentDto } from '../documents/requirements';

const DocumentParams = z.object({ documentId: IdSchema });
const BranchParams = z.object({ branchId: IdSchema });
const DocumentListQuery = PageQuerySchema.extend({ status: DocumentStatusSchema.default('pending_review') });
const BranchListQuery = PageQuerySchema.extend({ status: BranchStatusSchema.default('pending_review') });

type Cursor = { t: string; id: string };

/** Keyset "after (submittedAt, id)" in ascending order: oldest submissions first. */
function afterDocument(cursor: Cursor | null): SQL | undefined {
  if (!cursor) return undefined;
  const t = new Date(cursor.t);
  return or(gt(documents.submittedAt, t), and(eq(documents.submittedAt, t), gt(documents.id, cursor.id)));
}

/**
 * Administrative review of licences/documents and branch approval
 * (operations role; super_admin always allowed). Owners can never reach these routes:
 * they need an admin-audience token, which only admin sign-in issues.
 */
export async function adminReviewRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();
  const now = () => app.deps.clock();

  // --- Documents ---------------------------------------------------------------------
  async function adminDocument(documentId: string) {
    const [row] = await app.deps.db
      .select({ doc: documents, branchName: branches.name, businessLegalName: businesses.legalName })
      .from(documents)
      .innerJoin(branches, eq(branches.id, documents.branchId))
      .innerJoin(businesses, eq(businesses.id, branches.businessId))
      .where(eq(documents.id, documentId))
      .limit(1);
    if (!row) throw notFound('Document not found.');
    return row;
  }

  const toAdminDocument = (row: Awaited<ReturnType<typeof adminDocument>>) => ({
    ...toDocumentDto(row.doc),
    branchName: row.branchName,
    businessLegalName: row.businessLegalName,
  });

  app.get(paths.admin.documents, { schema: { querystring: DocumentListQuery, response: { 200: AdminDocumentPageSchema } } }, async (req) => {
    await requireAdmin(req, ['operations']);
    const cursor = decodeCursor<Cursor>(req.query.cursor);
    const rows = await app.deps.db
      .select({ doc: documents, branchName: branches.name, businessLegalName: businesses.legalName })
      .from(documents)
      .innerJoin(branches, eq(branches.id, documents.branchId))
      .innerJoin(businesses, eq(businesses.id, branches.businessId))
      .where(and(eq(documents.status, req.query.status), afterDocument(cursor)))
      .orderBy(asc(documents.submittedAt), asc(documents.id))
      .limit(req.query.limit + 1);
    const page = rows.slice(0, req.query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toAdminDocument),
      nextCursor: rows.length > req.query.limit && last ? encodeCursor({ t: last.doc.submittedAt.toISOString(), id: last.doc.id }) : null,
    };
  });

  app.get(paths.admin.documentFile(':documentId'), { schema: { params: DocumentParams } }, async (req, reply) => {
    const admin = await requireAdmin(req, ['operations']);
    const row = await adminDocument(req.params.documentId);
    await audit(app.deps.db, {
      actorUserId: admin.userId,
      actorType: 'admin',
      action: 'document.file_viewed',
      entityType: 'document',
      entityId: row.doc.id,
      branchId: row.doc.branchId,
      ip: req.ip,
    });
    return sendDocumentFile(req, reply, row.doc);
  });

  app.post(paths.admin.documentApprove(':documentId'), { schema: { params: DocumentParams, response: { 200: AdminDocumentSchema } } }, async (req) => {
    const admin = await requireAdmin(req, ['operations']);
    const row = await adminDocument(req.params.documentId);
    if (row.doc.status !== 'pending_review') {
      throw unprocessable('document.not_reviewable', 'Only documents waiting for review can be approved.');
    }
    if (isExpired(row.doc, now())) {
      throw unprocessable('document.not_reviewable', 'This document has expired; ask the restaurant to upload a current one.');
    }
    const { db } = app.deps;
    const [updated] = await db
      .update(documents)
      .set({ status: 'approved', reviewedBy: admin.userId, reviewedAt: now(), rejectionReason: null })
      .where(and(eq(documents.id, row.doc.id), eq(documents.status, 'pending_review')))
      .returning();
    if (!updated) throw conflict('conflict', 'The document changed meanwhile. Reload and try again.');
    await audit(db, {
      actorUserId: admin.userId,
      actorType: 'admin',
      action: 'document.approved',
      entityType: 'document',
      entityId: updated.id,
      branchId: updated.branchId,
      metadata: { type: updated.type },
      ip: req.ip,
    });
    return toAdminDocument({ ...row, doc: updated });
  });

  app.post(
    paths.admin.documentReject(':documentId'),
    { schema: { params: DocumentParams, body: RejectWithReasonSchema, response: { 200: AdminDocumentSchema } } },
    async (req) => {
      const admin = await requireAdmin(req, ['operations']);
      const row = await adminDocument(req.params.documentId);
      if (row.doc.status !== 'pending_review' && row.doc.status !== 'approved') {
        throw unprocessable('document.not_reviewable', 'This document cannot be rejected in its current state.');
      }
      const { db } = app.deps;
      const [updated] = await db
        .update(documents)
        .set({ status: 'rejected', reviewedBy: admin.userId, reviewedAt: now(), rejectionReason: req.body.reason })
        .where(and(eq(documents.id, row.doc.id), eq(documents.status, row.doc.status)))
        .returning();
      if (!updated) throw conflict('conflict', 'The document changed meanwhile. Reload and try again.');
      await audit(db, {
        actorUserId: admin.userId,
        actorType: 'admin',
        action: 'document.rejected',
        entityType: 'document',
        entityId: updated.id,
        branchId: updated.branchId,
        metadata: { type: updated.type, from: row.doc.status, reason: req.body.reason },
        ip: req.ip,
      });
      return toAdminDocument({ ...row, doc: updated });
    },
  );

  // --- Branches ----------------------------------------------------------------------
  async function toAdminBranch(branch: BranchRow) {
    const [meta] = await app.deps.db
      .select({ legalName: businesses.legalName, ownerName: users.fullName })
      .from(businesses)
      .innerJoin(users, eq(users.id, businesses.ownerUserId))
      .where(eq(businesses.id, branch.businessId))
      .limit(1);
    return {
      id: branch.id,
      name: branch.name,
      businessLegalName: meta?.legalName ?? '',
      ownerName: meta?.ownerName ?? null,
      city: branch.city,
      status: branch.status,
      submittedAt: branch.submittedAt?.toISOString() ?? null,
      approvalBlockers: await approvalBlockers(app.deps.db, branch, now()),
    };
  }

  async function loadBranch(branchId: string) {
    const [branch] = await app.deps.db.select().from(branches).where(eq(branches.id, branchId)).limit(1);
    if (!branch) throw notFound('Branch not found.');
    return branch;
  }

  async function transition(
    branch: BranchRow,
    from: BranchRow['status'][],
    set: Partial<typeof branches.$inferInsert>,
    action: string,
    adminId: string,
    ip: string,
    metadata: Record<string, unknown> = {},
  ) {
    if (!from.includes(branch.status)) {
      throw unprocessable('branch.invalid_transition', `A ${branch.status.replace('_', ' ')} branch cannot be changed this way.`);
    }
    const { db } = app.deps;
    const [updated] = await db
      .update(branches)
      .set({ ...set, updatedAt: now() })
      .where(and(eq(branches.id, branch.id), eq(branches.status, branch.status)))
      .returning();
    if (!updated) throw conflict('conflict', 'The branch changed meanwhile. Reload and try again.');
    await audit(db, {
      actorUserId: adminId,
      actorType: 'admin',
      action,
      entityType: 'branch',
      entityId: branch.id,
      branchId: branch.id,
      metadata: { from: branch.status, to: updated.status, ...metadata },
      ip,
    });
    return toAdminBranch(updated);
  }

  app.get(paths.admin.branches, { schema: { querystring: BranchListQuery, response: { 200: AdminBranchPageSchema } } }, async (req) => {
    await requireAdmin(req, ['operations']);
    const cursor = decodeCursor<Cursor>(req.query.cursor);
    const timeColumn = sql`coalesce(${branches.submittedAt}, ${branches.createdAt})`;
    const rows = await app.deps.db
      .select({ branch: branches, t: sql<Date>`coalesce(${branches.submittedAt}, ${branches.createdAt})`.mapWith(branches.createdAt) })
      .from(branches)
      .where(
        and(
          eq(branches.status, req.query.status),
          cursor
            ? or(sql`${timeColumn} > ${new Date(cursor.t)}`, and(sql`${timeColumn} = ${new Date(cursor.t)}`, gt(branches.id, cursor.id)))
            : undefined,
        ),
      )
      .orderBy(asc(timeColumn), asc(branches.id))
      .limit(req.query.limit + 1);
    const page = rows.slice(0, req.query.limit);
    const last = page[page.length - 1];
    return {
      items: await Promise.all(page.map((r) => toAdminBranch(r.branch))),
      nextCursor: rows.length > req.query.limit && last ? encodeCursor({ t: last.t.toISOString(), id: last.branch.id }) : null,
    };
  });

  app.post(
    paths.admin.branchApprove(':branchId'),
    { schema: { params: BranchParams, body: ApproveBranchSchema, response: { 200: AdminBranchSchema } } },
    async (req) => {
      const admin = await requireAdmin(req, ['operations']);
      const branch = await loadBranch(req.params.branchId);
      if (branch.status !== 'pending_review') {
        throw unprocessable('branch.invalid_transition', 'Only branches waiting for review can be approved.');
      }
      const blockers = await approvalBlockers(app.deps.db, branch, now());
      if (blockers.length > 0) {
        throw unprocessable('branch.documents_incomplete', `Cannot approve yet: ${blockers.join(' ')}`, { approval: blockers });
      }
      return transition(
        branch,
        ['pending_review'],
        {
          status: 'active',
          statusReason: null,
          commissionBps: req.body.commissionBps,
          approvedAt: now(),
          approvedBy: admin.userId,
          // The owner decides when to start taking orders.
          isAcceptingOrders: false,
        },
        'branch.approved',
        admin.userId,
        req.ip,
        { commissionBps: req.body.commissionBps, note: req.body.note },
      );
    },
  );

  app.post(
    paths.admin.branchReject(':branchId'),
    { schema: { params: BranchParams, body: RejectWithReasonSchema, response: { 200: AdminBranchSchema } } },
    async (req) => {
      const admin = await requireAdmin(req, ['operations']);
      const branch = await loadBranch(req.params.branchId);
      return transition(branch, ['pending_review'], { status: 'rejected', statusReason: req.body.reason }, 'branch.rejected', admin.userId, req.ip, {
        reason: req.body.reason,
      });
    },
  );

  app.post(
    paths.admin.branchSuspend(':branchId'),
    { schema: { params: BranchParams, body: RejectWithReasonSchema, response: { 200: AdminBranchSchema } } },
    async (req) => {
      const admin = await requireAdmin(req, ['operations']);
      const branch = await loadBranch(req.params.branchId);
      return transition(
        branch,
        ['active'],
        { status: 'suspended', statusReason: req.body.reason, isAcceptingOrders: false },
        'branch.suspended',
        admin.userId,
        req.ip,
        { reason: req.body.reason },
      );
    },
  );

  app.post(paths.admin.branchReinstate(':branchId'), { schema: { params: BranchParams, response: { 200: AdminBranchSchema } } }, async (req) => {
    const admin = await requireAdmin(req, ['operations']);
    const branch = await loadBranch(req.params.branchId);
    if (branch.status !== 'suspended') {
      throw unprocessable('branch.invalid_transition', 'Only suspended branches can be reinstated.');
    }
    // Reinstating must not bypass verification: the licence may have expired meanwhile.
    const blockers = await approvalBlockers(app.deps.db, branch, now());
    if (blockers.length > 0) {
      throw unprocessable('branch.documents_incomplete', `Cannot reinstate yet: ${blockers.join(' ')}`, { approval: blockers });
    }
    return transition(branch, ['suspended'], { status: 'active', statusReason: null }, 'branch.reinstated', admin.userId, req.ip);
  });
}
