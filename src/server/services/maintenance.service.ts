import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { expireReservations } from "./reservation.service";
import { processWaitlists } from "./waitlist.service";
import { dispatchPendingEmails, recoverStuckEmails } from "./email/outbox";
import { publish } from "./realtime";

/**
 * Tareas periódicas (worker):
 *  - expirar reservas vencidas y liberar lugares
 *  - promover lista de espera cuando haya lugares
 *  - enviar correos pendientes del outbox (con reintentos)
 *  - purgar OTP, sesiones y claves de idempotencia vencidas
 */
export async function runMaintenanceTick() {
  const expiredIn = await expireReservations();
  for (const id of expiredIn) void publish({ type: "workshop.updated", workshopId: id, at: new Date().toISOString() });
  const promoted = await processWaitlists();
  await recoverStuckEmails();
  const mail = await dispatchPendingEmails(50);
  if (expiredIn.length || promoted || mail.sent || mail.failed) {
    logger.info("maintenance_tick", { expiredWorkshops: expiredIn.length, promoted, emailsSent: mail.sent, emailsFailed: mail.failed });
  }
}

export async function runCleanup() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const [otp, st, adm, idem] = await Promise.all([
    db().emailVerification.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
    db().studentSession.deleteMany({ where: { expiresAt: { lt: dayAgo } } }),
    db().adminSession.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 24 * 3600_000) } } }),
    db().idempotencyKey.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  logger.info("cleanup", { otp: otp.count, studentSessions: st.count, adminSessions: adm.count, idempotencyKeys: idem.count });
}
