import { randomUUID } from 'node:crypto';

import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  AcceptDeclarationSchema,
  DeclarationAcceptanceSchema,
  DeclarationSchema,
  DeclarationStatusSchema,
  DOCUMENT_UPLOAD_LIMITS,
  DocumentSchema,
  DocumentsResponseSchema,
  IdSchema,
  paths,
  UploadDocumentFieldsSchema,
} from '@hungerly/api-client';

import { requireBusiness, requireOwnedBranch, requirePartner } from '../../auth/guard';
import { branches, declarationAcceptances, documents } from '../../db/schema';
import { audit } from '../../lib/audit';
import { sha256Hex } from '../../lib/crypto';
import { AppError, notFound, unprocessable, validationError } from '../../lib/errors';
import { sniffMime } from '../../lib/storage';
import { istDate } from '../../lib/time';
import { currentDeclaration, DECLARATION_VERSION } from './declaration';
import { documentRequirements, loadBranchDocuments, toDocumentDto, type DocumentRow } from './requirements';

const BranchParams = z.object({ branchId: IdSchema });
const DocumentParams = z.object({ documentId: IdSchema });

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

interface UploadPayload {
  fields: Record<string, string>;
  file: { data: Buffer; fileName: string } | null;
}

async function readUpload(request: FastifyRequest): Promise<UploadPayload> {
  if (!request.isMultipart()) {
    throw validationError('Send the document as multipart/form-data.', { file: ['Choose a file to upload.'] });
  }
  const fields: Record<string, string> = {};
  let file: UploadPayload['file'] = null;
  for await (const part of request.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'file' || file) {
        await part.toBuffer();
        continue;
      }
      const data = await part.toBuffer();
      if (part.file.truncated) {
        throw new AppError(413, 'document.invalid_file', 'The file is larger than 8 MB.');
      }
      file = { data, fileName: part.filename || 'document' };
    } else if (typeof part.value === 'string') {
      fields[part.fieldname] = part.value;
    }
  }
  return { fields, file };
}

/** Streams a private document. Callers must have authorized access already. */
export async function sendDocumentFile(request: FastifyRequest, reply: FastifyReply, row: DocumentRow) {
  const stream = await request.server.deps.storage.read('private', row.storageKey);
  if (!stream) throw notFound('The file is no longer available.');
  const safeName = row.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'document';
  return reply
    .header('Content-Type', row.mimeType)
    .header('Content-Disposition', `attachment; filename="${safeName}"`)
    .header('Cache-Control', 'private, no-store')
    .header('X-Content-Type-Options', 'nosniff')
    .send(stream);
}

export async function documentRoutes(api: FastifyInstance) {
  const app = api.withTypeProvider<ZodTypeProvider>();
  const now = () => app.deps.clock();

  app.get(paths.partner.documents(':branchId'), { schema: { params: BranchParams, response: { 200: DocumentsResponseSchema } } }, async (req) => {
    const { branch } = await requireOwnedBranch(req, req.params.branchId);
    const rows = await loadBranchDocuments(app.deps.db, branch.id);
    return { requirements: documentRequirements(rows, now()), history: rows.map(toDocumentDto) };
  });

  app.post(paths.partner.documents(':branchId'), { schema: { params: BranchParams, response: { 201: DocumentSchema } } }, async (req, reply) => {
    const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
    if (branch.status === 'closed') throw unprocessable('branch.invalid_transition', 'This branch is closed.');

    const upload = await readUpload(req);
    const parsed = UploadDocumentFieldsSchema.safeParse(upload.fields);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (errors[issue.path.join('.') || '_'] ??= []).push(issue.message);
      throw validationError('Some fields need attention.', errors);
    }
    const fields = parsed.data;
    if (!upload.file || upload.file.data.length === 0) {
      throw validationError('Choose a file to upload.', { file: ['Choose a file to upload.'] });
    }
    if (upload.file.data.length > DOCUMENT_UPLOAD_LIMITS.maxBytes) {
      throw new AppError(413, 'document.invalid_file', 'The file is larger than 8 MB.');
    }
    const mime = sniffMime(upload.file.data);
    if (!mime || !(DOCUMENT_UPLOAD_LIMITS.mimeTypes as readonly string[]).includes(mime)) {
      throw unprocessable('document.invalid_file', 'Upload a PDF, JPG or PNG file.', { file: ['Upload a PDF, JPG or PNG file.'] });
    }
    if (fields.type === 'fssai_license') {
      const errors: Record<string, string[]> = {};
      if (!fields.documentNumber || !/^\d{14}$/.test(fields.documentNumber)) {
        errors.documentNumber = ['Enter the 14-digit FSSAI licence or registration number.'];
      }
      // The expiry date is optional (registration no longer asks for it); one that is given must be in the future.
      if (fields.expiresOn && fields.expiresOn <= istDate(now())) errors.expiresOn = ['This licence has already expired.'];
      if (Object.keys(errors).length) throw validationError('Check the licence details.', errors);
    } else if (fields.expiresOn && fields.expiresOn <= istDate(now())) {
      throw validationError('This document has already expired.', { expiresOn: ['Choose a future expiry date.'] });
    }

    const { db, storage } = app.deps;
    const storageKey = `documents/${branch.id}/${randomUUID()}.${EXTENSIONS[mime]}`;
    await storage.put('private', storageKey, upload.file.data);

    const created = await db.transaction(async (tx) => {
      // A new upload replaces the previous one of the same type, whatever its state.
      // It is never approved by uploading; it always waits for an administrator.
      const superseded = await tx
        .update(documents)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(documents.branchId, branch.id),
            eq(documents.type, fields.type),
            inArray(documents.status, ['pending_review', 'rejected', 'approved', 'expired']),
          ),
        )
        .returning({ id: documents.id, status: documents.status });
      const [row] = await tx
        .insert(documents)
        .values({
          branchId: branch.id,
          type: fields.type,
          documentNumber: fields.documentNumber ?? null,
          expiresOn: fields.expiresOn ?? null,
          storageKey,
          fileName: upload.file!.fileName.slice(0, 200),
          mimeType: mime,
          sizeBytes: upload.file!.data.length,
          sha256: sha256Hex(upload.file!.data),
          status: 'pending_review',
          submittedBy: auth.userId,
          submittedAt: now(),
        })
        .returning();
      await audit(tx, {
        actorUserId: auth.userId,
        actorType: 'owner',
        action: 'document.uploaded',
        entityType: 'document',
        entityId: row!.id,
        branchId: branch.id,
        metadata: { type: fields.type, supersededIds: superseded.map((s) => s.id) },
        ip: req.ip,
      });
      return row!;
    });
    return reply.status(201).send(toDocumentDto(created));
  });

  app.get(paths.partner.documentFile(':documentId'), { schema: { params: DocumentParams } }, async (req, reply) => {
    const auth = await requireBusiness(req);
    const [row] = await app.deps.db
      .select({ doc: documents })
      .from(documents)
      .innerJoin(branches, eq(branches.id, documents.branchId))
      .where(and(eq(documents.id, req.params.documentId), eq(branches.businessId, auth.businessId)))
      .limit(1);
    if (!row) throw notFound('Document not found.');
    return sendDocumentFile(req, reply, row.doc);
  });

  // --- Declaration -----------------------------------------------------------------------
  app.get(paths.partner.declaration, { schema: { response: { 200: DeclarationSchema } } }, async (req) => {
    await requirePartner(req);
    return currentDeclaration();
  });

  async function declarationStatus(branchId: string) {
    const rows = await app.deps.db
      .select()
      .from(declarationAcceptances)
      .where(eq(declarationAcceptances.branchId, branchId))
      .orderBy(declarationAcceptances.acceptedAt);
    const current = rows.find((r) => r.version === DECLARATION_VERSION) ?? rows[rows.length - 1] ?? null;
    return {
      current: currentDeclaration(),
      acceptance: current
        ? {
            version: current.version,
            acceptedAt: current.acceptedAt.toISOString(),
            acceptedBy: current.userId,
            isCurrentVersion: current.version === DECLARATION_VERSION,
          }
        : null,
    };
  }

  app.get(
    paths.partner.branchDeclaration(':branchId'),
    { schema: { params: BranchParams, response: { 200: DeclarationStatusSchema } } },
    async (req) => {
      const { branch } = await requireOwnedBranch(req, req.params.branchId);
      return declarationStatus(branch.id);
    },
  );

  app.post(
    paths.partner.branchDeclaration(':branchId'),
    { schema: { params: BranchParams, body: AcceptDeclarationSchema, response: { 200: DeclarationAcceptanceSchema, 201: DeclarationAcceptanceSchema } } },
    async (req, reply) => {
      const { auth, branch } = await requireOwnedBranch(req, req.params.branchId);
      const declaration = currentDeclaration();
      if (req.body.version !== declaration.version || req.body.textSha256 !== declaration.textSha256) {
        throw unprocessable('declaration.outdated', 'The declaration has been updated. Please read the latest version and accept it.');
      }
      const { db } = app.deps;
      const [row] = await db
        .insert(declarationAcceptances)
        .values({
          branchId: branch.id,
          businessId: branch.businessId,
          userId: auth.userId,
          version: declaration.version,
          textSha256: declaration.textSha256,
          ip: req.ip,
          userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
          acceptedAt: now(),
        })
        .onConflictDoNothing()
        .returning();
      if (row) {
        await audit(db, {
          actorUserId: auth.userId,
          actorType: 'owner',
          action: 'declaration.accepted',
          entityType: 'branch',
          entityId: branch.id,
          branchId: branch.id,
          metadata: { version: declaration.version, textSha256: declaration.textSha256 },
          ip: req.ip,
        });
      }
      const status = await declarationStatus(branch.id);
      return reply.status(row ? 201 : 200).send(status.acceptance!);
    },
  );
}
