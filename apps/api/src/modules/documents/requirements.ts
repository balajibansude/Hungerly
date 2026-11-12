import { desc, eq } from 'drizzle-orm';

import type { BranchDocument, DocumentRequirement, DocumentState, DocumentType } from '@hungerly/api-client';

import type { Db } from '../../db/client';
import { documents } from '../../db/schema';
import { iso, istDate } from '../../lib/time';

export type DocumentRow = typeof documents.$inferSelect;

/** Documents every branch must have approved before it can go live. */
export const REQUIRED_DOCUMENT_TYPES: DocumentType[] = ['fssai_license', 'bank_proof'];
/** Shown to owners as optional uploads. */
export const OPTIONAL_DOCUMENT_TYPES: DocumentType[] = ['gst_certificate', 'pan_card', 'shop_establishment'];

const LABELS: Record<DocumentType, string> = {
  fssai_license: 'FSSAI licence',
  bank_proof: 'bank proof (cancelled cheque or bank statement)',
  gst_certificate: 'GST certificate',
  pan_card: 'PAN card',
  shop_establishment: 'shop and establishment certificate',
  other: 'document',
};

export function documentLabel(type: DocumentType): string {
  return LABELS[type];
}

export function toDocumentDto(row: DocumentRow): BranchDocument {
  return {
    id: row.id,
    branchId: row.branchId,
    type: row.type,
    documentNumber: row.documentNumber,
    expiresOn: row.expiresOn,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    rejectionReason: row.rejectionReason,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: iso(row.reviewedAt),
  };
}

/** The approved document has passed its expiry date (IST calendar). */
export function isExpired(row: Pick<DocumentRow, 'expiresOn'>, now: Date): boolean {
  return row.expiresOn !== null && row.expiresOn < istDate(now);
}

export function documentState(current: DocumentRow | null, now: Date): DocumentState {
  if (!current) return 'not_submitted';
  switch (current.status) {
    case 'pending_review':
      return 'pending_review';
    case 'approved':
      return isExpired(current, now) ? 'expired' : 'approved';
    case 'rejected':
      return 'resubmission_required';
    case 'expired':
      return 'expired';
    default:
      return 'not_submitted';
  }
}

function nextAction(type: DocumentType, state: DocumentState, current: DocumentRow | null): string | null {
  const label = LABELS[type];
  switch (state) {
    case 'not_submitted':
      return `Upload your ${label}.`;
    case 'pending_review':
      return `Your ${label} is being reviewed by Swaadone.`;
    case 'resubmission_required':
      return `Your ${label} was not accepted${current?.rejectionReason ? `: ${current.rejectionReason}` : ''}. Upload a corrected one.`;
    case 'expired':
      return `Your ${label} has expired. Upload the renewed one.`;
    default:
      return null;
  }
}

export async function loadBranchDocuments(db: Db, branchId: string): Promise<DocumentRow[]> {
  return db.select().from(documents).where(eq(documents.branchId, branchId)).orderBy(desc(documents.submittedAt));
}

/** Latest non-superseded document of each type. */
export function currentByType(rows: DocumentRow[]): Map<DocumentType, DocumentRow> {
  const map = new Map<DocumentType, DocumentRow>();
  for (const row of rows) {
    if (row.status === 'superseded') continue;
    if (!map.has(row.type)) map.set(row.type, row);
  }
  return map;
}

export function documentRequirements(rows: DocumentRow[], now: Date): DocumentRequirement[] {
  const current = currentByType(rows);
  const types: { type: DocumentType; required: boolean }[] = [
    ...REQUIRED_DOCUMENT_TYPES.map((type) => ({ type, required: true })),
    ...OPTIONAL_DOCUMENT_TYPES.map((type) => ({ type, required: false })),
  ];
  return types.map(({ type, required }) => {
    const row = current.get(type) ?? null;
    const state = documentState(row, now);
    return {
      type,
      required,
      state,
      current: row ? toDocumentDto(row) : null,
      nextAction: nextAction(type, state, row),
    };
  });
}
