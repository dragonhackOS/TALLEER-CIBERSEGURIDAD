import { db, withTransaction, isUniqueViolation } from "@/lib/db";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  assertAcceptingRegistrations,
  heldSeats,
  lockStudent,
  lockWorkshop,
  waitingCount,
} from "@/server/repositories/workshop-lock.repository";
import { findActiveConflict } from "./registration.service";

/**
 * Reserva temporal de lugar (por defecto 5 minutos).
 * - Se guarda en PostgreSQL (fuente de verdad) con expires_at.
 * - Cuenta como lugar ocupado mientras esté vigente.
 * - Expira sola: toda consulta de disponibilidad ignora reservas vencidas,
 *   y el worker las marca como EXPIRED periódicamente. No depende de JavaScript.
 */
export interface ReservationResult {
  reservationId: string;
  workshopId: string;
  expiresAt: Date;
  createdAt: Date;
  reused: boolean;
}

export async function createReservation(studentId: string, workshopId: string): Promise<ReservationResult> {
  try {
    return await withTransaction(
      async (tx) => {
        await lockStudent(tx, studentId);
        const w = await lockWorkshop(tx, workshopId);
        assertAcceptingRegistrations(w);

        const conflict = await findActiveConflict(tx, studentId, w);
        if (conflict) throw Errors.alreadyRegistered({ publicId: conflict.publicId, workshopName: conflict.workshopName });

        const now = new Date();
        const current = await tx.reservation.findFirst({ where: { studentId, status: "ACTIVE" } });
        if (current && current.workshopId === workshopId && current.expiresAt > now) {
          return { reservationId: current.id, workshopId, expiresAt: current.expiresAt, createdAt: current.createdAt, reused: true };
        }
        if (current) {
          await tx.reservation.update({
            where: { id: current.id },
            data: { status: current.expiresAt > now ? "RELEASED" : "EXPIRED" },
          });
        }

        const held = await heldSeats(tx, workshopId);
        const waiting = await waitingCount(tx, workshopId);
        // La lista de espera tiene prioridad sobre nuevos alumnos.
        if (w.registeredCount + held >= w.maxCapacity || waiting > 0) {
          throw Errors.workshopFull({ waitlistAvailable: true });
        }

        const expiresAt = new Date(now.getTime() + env().RESERVATION_TIMEOUT_MINUTES * 60_000);
        const r = await tx.reservation.create({ data: { studentId, workshopId, expiresAt } });
        return { reservationId: r.id, workshopId, expiresAt: r.expiresAt, createdAt: r.createdAt, reused: false };
      },
      { label: "create_reservation" },
    );
  } catch (err) {
    if (isUniqueViolation(err, "uq_reservation_active_student")) {
      throw Errors.conflict("RESERVATION_CONFLICT", "Ya tienes una reserva en proceso. Inténtalo de nuevo.");
    }
    throw err;
  }
}

export async function releaseReservation(studentId: string, reservationId: string): Promise<boolean> {
  const res = await db().reservation.updateMany({
    where: { id: reservationId, studentId, status: "ACTIVE" },
    data: { status: "RELEASED" },
  });
  return res.count > 0;
}

/** Libera todas las reservas activas de un alumno (sesión expirada / cierre). */
export async function releaseStudentReservations(studentId: string, reason: string) {
  const res = await db().reservation.updateMany({
    where: { studentId, status: "ACTIVE" },
    data: { status: "RELEASED" },
  });
  if (res.count > 0) logger.info("reservations_released", { reason, count: res.count });
}

/** Marca como EXPIRED las reservas vencidas; devuelve talleres afectados. */
export async function expireReservations(): Promise<string[]> {
  const rows = await db().$queryRaw<{ workshop_id: string }[]>`
    UPDATE reservations SET status = 'EXPIRED', updated_at = timezone('utc', now())
     WHERE status = 'ACTIVE' AND expires_at <= timezone('utc', now())
     RETURNING workshop_id`;
  return [...new Set(rows.map((r) => r.workshop_id))];
}

export async function getReservation(studentId: string, reservationId: string) {
  return db().reservation.findFirst({ where: { id: reservationId, studentId } });
}
