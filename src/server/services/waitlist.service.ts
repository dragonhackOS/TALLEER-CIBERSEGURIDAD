import { db, withTransaction, isUniqueViolation, type Tx } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { StudentProfileInput } from "@/schemas";
import {
  heldSeats,
  lockStudent,
  lockWorkshop,
  waitingCount,
  type LockedWorkshop,
} from "@/server/repositories/workshop-lock.repository";
import { audit } from "./audit.service";
import { enqueueEmail, kickDispatcher } from "./email/outbox";
import { publish, type RealtimeEvent } from "./realtime";
import { findActiveConflict, insertRegistration, updateStudentProfile } from "./registration.service";

/**
 * Lista de espera. Cuando un taller está lleno el alumno puede unirse; al
 * liberarse un lugar (cancelación, aumento de capacidad, reserva vencida) se
 * promueve automáticamente al primero, TODO dentro de transacciones.
 */
export async function joinWaitlist(input: {
  studentId: string;
  workshopId: string;
  profile: StudentProfileInput;
  ipHash?: string | null;
}): Promise<{ entryId: string; position: number }> {
  try {
    const res = await withTransaction(
      async (tx) => {
        await lockStudent(tx, input.studentId);
        const w = await lockWorkshop(tx, input.workshopId);
        if (w.archivedAt || !["OPEN", "FULL"].includes(w.status)) throw Errors.workshopClosed();

        const conflict = await findActiveConflict(tx, input.studentId, w);
        if (conflict) throw Errors.alreadyRegistered({ publicId: conflict.publicId, workshopName: conflict.workshopName });

        const already = await tx.waitlistEntry.findFirst({ where: { studentId: input.studentId, workshopId: w.id, status: "WAITING" } });
        if (already) throw Errors.alreadyWaitlisted();

        const held = await heldSeats(tx, w.id);
        const waiting = await waitingCount(tx, w.id);
        if (w.status !== "FULL" && w.registeredCount + held < w.maxCapacity && waiting === 0) throw Errors.seatsAvailable();

        await updateStudentProfile(tx, input.studentId, input.profile);
        const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
          SELECT (COALESCE(MAX(position), 0) + 1)::int AS next FROM waitlist_entries WHERE workshop_id = ${w.id}::uuid`;
        const entry = await tx.waitlistEntry.create({
          data: { studentId: input.studentId, workshopId: w.id, position: Number(next), status: "WAITING" },
        });
        const rank = waiting + 1;
        await audit(
          {
            action: "WAITLIST_JOINED",
            actorType: "STUDENT",
            resourceType: "waitlist",
            resourceId: entry.id,
            metadata: { workshop: w.slug, position: rank },
            ipHash: input.ipHash ?? null,
          },
          tx,
        );
        const student = await tx.student.findUniqueOrThrow({ where: { id: input.studentId } });
        await enqueueEmail(tx, {
          to: [student.email],
          template: "STUDENT_WAITLIST_JOINED",
          subject: `Lista de espera — ${w.name}`,
          payload: { workshopName: w.name, position: rank },
          relatedType: "waitlist",
          relatedId: entry.id,
        });
        return { entryId: entry.id, position: rank, workshopId: w.id };
      },
      { label: "join_waitlist" },
    );
    void publish({ type: "waitlist.changed", workshopId: res.workshopId, at: new Date().toISOString() });
    kickDispatcher();
    return { entryId: res.entryId, position: res.position };
  } catch (err) {
    if (isUniqueViolation(err, "uq_waitlist")) throw Errors.alreadyWaitlisted();
    throw err;
  }
}

/**
 * Promueve alumnos de la lista de espera mientras existan lugares libres.
 * PRECONDICIÓN: el llamador tiene el lock FOR UPDATE del taller.
 */
export async function fillFromWaitlist(tx: Tx, w: LockedWorkshop, events: RealtimeEvent[]): Promise<number> {
  if (w.archivedAt || !["OPEN", "FULL"].includes(w.status)) return 0;
  let promoted = 0;
  let registered = w.registeredCount;
  for (let guard = 0; guard < 1000; guard++) {
    const held = await heldSeats(tx, w.id);
    if (registered + held >= w.maxCapacity) break;

    const [next] = await tx.$queryRaw<{ id: string; student_id: string }[]>`
      SELECT id, student_id FROM waitlist_entries
       WHERE workshop_id = ${w.id}::uuid AND status = 'WAITING'
       ORDER BY position ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`;
    if (!next) break;

    await lockStudent(tx, next.student_id);
    const conflict = await findActiveConflict(tx, next.student_id, w);
    if (conflict) {
      await tx.waitlistEntry.update({ where: { id: next.id }, data: { status: "CANCELLED" } });
      continue;
    }

    const { outcome, event } = await insertRegistration(tx, {
      studentId: next.student_id,
      w: { ...w, status: "OPEN" },
      source: "WAITLIST",
    });
    await tx.waitlistEntry.update({
      where: { id: next.id },
      data: { status: "PROMOTED", promotedRegistrationId: outcome.registrationId },
    });
    registered = outcome.registered;
    events.push(event, { type: "waitlist.changed", workshopId: w.id, at: new Date().toISOString() });
    promoted++;
    logger.info("waitlist_promoted", { registrationId: outcome.registrationId, workshop: w.slug });
  }
  return promoted;
}

/** Revisa talleres con lista de espera y lugares libres (p. ej. tras vencer reservas). */
export async function processWaitlists(workshopIds?: string[]): Promise<number> {
  const candidates =
    workshopIds ??
    (
      await db().waitlistEntry.findMany({ where: { status: "WAITING" }, select: { workshopId: true }, distinct: ["workshopId"] })
    ).map((r) => r.workshopId);
  let total = 0;
  for (const id of candidates) {
    const events: RealtimeEvent[] = [];
    const n = await withTransaction(
      async (tx) => {
        events.length = 0;
        const w = await lockWorkshop(tx, id);
        return fillFromWaitlist(tx, w, events);
      },
      { label: "process_waitlist" },
    );
    for (const e of events) void publish(e);
    total += n;
  }
  if (total > 0) kickDispatcher();
  return total;
}

export async function leaveWaitlist(input: { entryId: string; by: { type: "STUDENT"; studentId: string } | { type: "ADMIN"; adminId: string } }) {
  const entry = await db().waitlistEntry.findUnique({ where: { id: input.entryId } });
  if (!entry || (input.by.type === "STUDENT" && entry.studentId !== input.by.studentId)) throw Errors.notFound();
  const res = await db().waitlistEntry.updateMany({ where: { id: entry.id, status: "WAITING" }, data: { status: "CANCELLED" } });
  if (res.count === 0) throw Errors.conflict("NOT_WAITING", "La entrada ya no está en espera.");
  await audit({
    action: "WAITLIST_REMOVED",
    adminId: input.by.type === "ADMIN" ? input.by.adminId : null,
    actorType: input.by.type,
    resourceType: "waitlist",
    resourceId: entry.id,
  });
  void publish({ type: "waitlist.changed", workshopId: entry.workshopId, at: new Date().toISOString() });
}

/** Posición actual (1-based) de una entrada en espera. */
export async function waitlistRank(entryId: string): Promise<number | null> {
  const e = await db().waitlistEntry.findUnique({ where: { id: entryId } });
  if (!e || e.status !== "WAITING") return null;
  const ahead = await db().waitlistEntry.count({ where: { workshopId: e.workshopId, status: "WAITING", position: { lt: e.position } } });
  return ahead + 1;
}
