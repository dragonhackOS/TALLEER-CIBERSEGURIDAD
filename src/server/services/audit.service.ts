import { db, type Tx } from "@/lib/db";
import { logger } from "@/lib/logger";
import type { ActorType } from "@/generated/prisma/enums";

export type AuditAction =
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "WORKSHOP_CREATED"
  | "WORKSHOP_UPDATED"
  | "WORKSHOP_STATUS_CHANGED"
  | "WORKSHOP_DUPLICATED"
  | "CAPACITY_CHANGED"
  | "REGISTRATION_CREATED"
  | "REGISTRATION_CANCELLED"
  | "STUDENT_MOVED"
  | "CHECKIN"
  | "CHECKIN_UNDONE"
  | "NO_SHOW_MARKED"
  | "QR_REGENERATED"
  | "CONFIRMATION_RESENT"
  | "ADMIN_CREATED"
  | "ADMIN_UPDATED"
  | "SESSIONS_REVOKED"
  | "PASSWORD_CHANGED"
  | "TOTP_ENABLED"
  | "TOTP_DISABLED"
  | "EXPORT_CREATED"
  | "EMAIL_SENT"
  | "EMAIL_FAILED"
  | "WAITLIST_JOINED"
  | "WAITLIST_PROMOTED"
  | "WAITLIST_REMOVED"
  | "SETTINGS_UPDATED";

export interface AuditEntry {
  action: AuditAction;
  adminId?: string | null;
  actorType?: ActorType;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
}

/** Registro de auditoría (append-only, protegido por trigger en PostgreSQL). */
export async function audit(entry: AuditEntry, tx?: Tx) {
  const client = tx ?? db();
  try {
    await client.auditLog.create({
      data: {
        action: entry.action,
        adminId: entry.adminId ?? null,
        actorType: entry.actorType ?? (entry.adminId ? "ADMIN" : "SYSTEM"),
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        metadata: (entry.metadata ?? undefined) as object | undefined,
        ipHash: entry.ipHash ?? null,
      },
    });
  } catch (err) {
    // Dentro de una transacción el error debe propagarse (atomicidad).
    if (tx) throw err;
    logger.error("audit_write_failed", { action: entry.action, message: (err as Error).message });
  }
}
