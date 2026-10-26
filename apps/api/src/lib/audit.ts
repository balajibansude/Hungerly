import type { Db } from '../db/client';
import { auditLogs } from '../db/schema';

export interface AuditEntry {
  actorUserId: string | null;
  actorType: 'owner' | 'admin' | 'system' | 'provider';
  action: string;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  /** Must not contain secrets, OTPs, tokens or full bank account numbers. */
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    actorType: entry.actorType,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    branchId: entry.branchId ?? null,
    metadata: entry.metadata ?? {},
    ip: entry.ip ?? null,
  });
}
