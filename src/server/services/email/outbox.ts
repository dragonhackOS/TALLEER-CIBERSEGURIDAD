import { db, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { audit } from "@/server/services/audit.service";
import { sendMail } from "./mailer";
import { renderTemplate, type TemplateName } from "./templates";

/**
 * Patrón OUTBOX: los correos se insertan en `email_logs` DENTRO de la misma
 * transacción que la inscripción. Solo son visibles (y se envían) después de
 * un COMMIT exitoso. Si la transacción falla, no se envía nada.
 */
export async function enqueueEmail(
  tx: Tx,
  input: { to: string[]; template: TemplateName; subject: string; payload: Record<string, unknown>; relatedType?: string; relatedId?: string },
) {
  if (input.to.length === 0) return;
  await tx.emailLog.create({
    data: {
      toAddresses: input.to,
      template: input.template,
      subject: input.subject.slice(0, 250),
      payload: input.payload as object,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
    },
  });
}

const MAX_ATTEMPTS = 6;

/** Reclama y envía correos pendientes (seguro con múltiples procesos: SKIP LOCKED). */
export async function dispatchPendingEmails(limit = 25): Promise<{ sent: number; failed: number }> {
  const claimed = await db().$queryRaw<{ id: string }[]>`
    UPDATE email_logs SET status = 'SENDING', attempts = attempts + 1, next_attempt_at = timezone('utc', now()) + interval '10 minutes'
    WHERE id IN (
      SELECT id FROM email_logs
      WHERE status = 'PENDING' AND next_attempt_at <= timezone('utc', now())
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  let sent = 0;
  let failed = 0;
  for (const { id } of claimed) {
    const row = await db().emailLog.findUnique({ where: { id } });
    if (!row) continue;
    try {
      const rendered = await renderTemplate(row.template as TemplateName, (row.payload ?? {}) as Record<string, unknown>);
      await sendMail(row.toAddresses, rendered);
      await db().emailLog.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
      await audit({
        action: "EMAIL_SENT",
        actorType: "SYSTEM",
        resourceType: "email",
        resourceId: id,
        metadata: { template: row.template, recipients: row.toAddresses.length, relatedId: row.relatedId },
      });
      sent++;
    } catch (err) {
      failed++;
      const final = row.attempts >= MAX_ATTEMPTS;
      const backoffSec = Math.min(3600, 30 * 2 ** row.attempts);
      await db().emailLog.update({
        where: { id },
        data: {
          status: final ? "FAILED" : "PENDING",
          lastError: (err as Error).message.slice(0, 500),
          nextAttemptAt: new Date(Date.now() + backoffSec * 1000),
        },
      });
      logger.warn("email_send_failed", { emailId: id, template: row.template, attempt: row.attempts, final });
      if (final) {
        await audit({ action: "EMAIL_FAILED", actorType: "SYSTEM", resourceType: "email", resourceId: id, metadata: { template: row.template } });
      }
    }
  }
  return { sent, failed };
}

let dispatching = false;
/** Disparo inmediato tras el COMMIT (no bloquea la respuesta al alumno). */
export function kickDispatcher() {
  if (!env().EMAIL_DISPATCH_INLINE || dispatching) return;
  dispatching = true;
  setImmediate(async () => {
    try {
      await dispatchPendingEmails();
    } catch (err) {
      logger.error("email_dispatch_error", { message: (err as Error).message });
    } finally {
      dispatching = false;
    }
  });
}

/** Recupera correos atascados en SENDING (p. ej. proceso reiniciado). */
export async function recoverStuckEmails() {
  await db().emailLog.updateMany({
    // next_attempt_at actúa como "lease" de 10 minutos al reclamar el correo.
    where: { status: "SENDING", nextAttemptAt: { lt: new Date() } },
    data: { status: "PENDING" },
  });
}
