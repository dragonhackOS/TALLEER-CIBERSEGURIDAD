import { db, withTransaction, isUniqueViolation, isCheckViolation, type Tx } from "@/lib/db";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { generatePublicId, generateRegistrationCode } from "@/lib/crypto";
import { logger } from "@/lib/logger";
import type { StudentProfileInput } from "@/schemas";
import {
  assertAcceptingRegistrations,
  decrementRegistered,
  heldSeats,
  incrementRegistered,
  lockStudent,
  lockWorkshop,
  lockWorkshops,
  waitingCount,
  type LockedWorkshop,
} from "@/server/repositories/workshop-lock.repository";
import { audit } from "./audit.service";
import { evaluateCapacityAlerts, notifyCancellation, notifyNewRegistration, notifyStudentConfirmation } from "./notification.service";
import { kickDispatcher } from "./email/outbox";
import { publish, type RealtimeEvent } from "./realtime";
import { fillFromWaitlist } from "./waitlist.service";

export const ACTIVE_STATUSES = ["REGISTERED", "CHECKED_IN", "NO_SHOW"] as const;

export interface RegistrationOutcome {
  registrationId: string;
  publicId: string;
  code: string;
  studentName: string;
  workshop: { id: string; name: string; slug: string; date: Date; startTime: string; endTime: string; location: string };
  registered: number;
  capacity: number;
  available: number;
  createdAt: Date;
}

/** Busca una inscripción activa que impida inscribirse (según la política configurada). */
export async function findActiveConflict(
  tx: Tx,
  studentId: string,
  w: Pick<LockedWorkshop, "id" | "eventKey">,
): Promise<{ id: string; publicId: string; workshopName: string } | null> {
  const policy = env().REGISTRATION_POLICY;
  const existing = await tx.registration.findFirst({
    where: {
      studentId,
      status: { in: [...ACTIVE_STATUSES] },
      ...(policy === "ONE_PER_EVENT" ? { eventKey: w.eventKey } : { workshopId: w.id }),
    },
    select: { id: true, publicId: true, workshop: { select: { name: true } } },
  });
  return existing ? { id: existing.id, publicId: existing.publicId, workshopName: existing.workshop.name } : null;
}

async function uniqueCode(tx: Tx, prefix: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateRegistrationCode(prefix);
    const clash = await tx.registration.findUnique({ where: { registrationCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new Error("No se pudo generar un código único");
}

/**
 * Inserta una inscripción. PRECONDICIONES: el llamador ya tiene el lock del
 * alumno y el lock (FOR UPDATE) del taller, y ya validó la capacidad.
 * Todo ocurre dentro de la misma transacción: contador, inscripción,
 * auditoría y correos (outbox). Si algo falla → ROLLBACK completo.
 */
export async function insertRegistration(
  tx: Tx,
  args: {
    studentId: string;
    w: LockedWorkshop;
    source: "WEB" | "WAITLIST" | "ADMIN";
    reservationId?: string | null;
    actorAdminId?: string | null;
    ipHash?: string | null;
  },
): Promise<{ outcome: RegistrationOutcome; event: RealtimeEvent }> {
  const { w } = args;
  const { registered, capacity } = await incrementRegistered(tx, w.id);
  const student = await tx.student.findUniqueOrThrow({ where: { id: args.studentId } });
  const code = await uniqueCode(tx, w.codePrefix);
  const reg = await tx.registration.create({
    data: {
      publicId: generatePublicId(),
      registrationCode: code,
      studentId: args.studentId,
      workshopId: w.id,
      eventKey: w.eventKey,
      source: args.source,
    },
  });

  if (args.reservationId) {
    await tx.reservation.updateMany({ where: { id: args.reservationId, status: "ACTIVE" }, data: { status: "CONVERTED" } });
  }
  // Cualquier otra reserva activa del alumno se libera.
  await tx.reservation.updateMany({ where: { studentId: args.studentId, status: "ACTIVE" }, data: { status: "RELEASED" } });

  // Con política "un taller por evento", sale de otras listas de espera del mismo evento.
  if (env().REGISTRATION_POLICY === "ONE_PER_EVENT") {
    await tx.waitlistEntry.updateMany({
      where: { studentId: args.studentId, status: "WAITING", workshop: { eventKey: w.eventKey }, NOT: { workshopId: w.id } },
      data: { status: "CANCELLED" },
    });
  }

  await audit(
    {
      action: args.source === "WAITLIST" ? "WAITLIST_PROMOTED" : "REGISTRATION_CREATED",
      actorType: args.actorAdminId ? "ADMIN" : args.source === "WAITLIST" ? "SYSTEM" : "STUDENT",
      adminId: args.actorAdminId ?? null,
      resourceType: "registration",
      resourceId: reg.id,
      metadata: { workshop: w.slug, code, registered, capacity, source: args.source },
      ipHash: args.ipHash ?? null,
    },
    tx,
  );

  const available = capacity - registered;
  const promoted = args.source === "WAITLIST";
  await notifyStudentConfirmation(tx, reg.id, student.email, w.name, promoted);
  await notifyNewRegistration(tx, {
    registrationId: reg.id,
    studentName: student.fullName ?? student.email,
    email: student.email,
    classroom: student.classroom ?? "",
    semester: student.semester ?? 0,
    workshopName: w.name,
    code,
    registered,
    capacity,
    available,
    createdAt: reg.createdAt,
    promotedFromWaitlist: promoted,
  });
  await evaluateCapacityAlerts(tx, w, registered, capacity);

  const outcome: RegistrationOutcome = {
    registrationId: reg.id,
    publicId: reg.publicId,
    code,
    studentName: student.fullName ?? "",
    workshop: { id: w.id, name: w.name, slug: w.slug, date: w.date, startTime: w.startTime, endTime: w.endTime, location: w.location },
    registered,
    capacity,
    available,
    createdAt: reg.createdAt,
  };
  const event: RealtimeEvent = {
    type: "registration.created",
    workshopId: w.id,
    workshopName: w.name,
    studentName: student.fullName ?? "",
    registrationId: reg.id,
    registered,
    capacity,
    at: reg.createdAt.toISOString(),
    source: args.source,
  };
  return { outcome, event };
}

export async function updateStudentProfile(tx: Tx, studentId: string, p: StudentProfileInput) {
  await tx.student.update({
    where: { id: studentId },
    data: {
      fullName: p.fullName.replace(/\s+/g, " "),
      classroom: p.classroom.toUpperCase(),
      semester: p.semester,
      phone: p.phone ?? null,
      programmingExperience: p.programmingExperience ?? null,
      securityExperience: p.securityExperience ?? null,
      ctfBefore: p.ctfBefore ?? null,
      privacyAcceptedAt: new Date(),
    },
  });
}

/**
 * FLUJO TRANSACCIONAL DE INSCRIPCIÓN
 *   BEGIN
 *   1. lock del alumno (serializa sus solicitudes)
 *   2. SELECT ... FOR UPDATE del taller
 *   3. validar estado / ventana de inscripción
 *   4. verificar duplicados (política configurable)
 *   5. validar reserva propia o lugares libres (inscritos + reservas vigentes)
 *   6. UPDATE atómico condicionado del contador (+ CHECK en BD)
 *   7. crear inscripción, auditoría, correos (outbox)
 *   COMMIT
 */
export async function registerStudent(input: {
  studentId: string;
  workshopId: string;
  reservationId?: string | null;
  profile?: StudentProfileInput;
  ipHash?: string | null;
  /** Se ejecuta dentro de la transacción tras el éxito (p. ej. guardar idempotencia). */
  onCommitting?: (tx: Tx, outcome: RegistrationOutcome) => Promise<void>;
}): Promise<RegistrationOutcome> {
  let event: RealtimeEvent | null = null;
  try {
    const outcome = await withTransaction(
      async (tx) => {
        await lockStudent(tx, input.studentId);
        const w = await lockWorkshop(tx, input.workshopId);
        assertAcceptingRegistrations(w);

        const conflict = await findActiveConflict(tx, input.studentId, w);
        if (conflict) throw Errors.alreadyRegistered({ publicId: conflict.publicId, workshopName: conflict.workshopName });

        const now = new Date();
        const reservation = input.reservationId
          ? await tx.reservation.findFirst({
              where: { id: input.reservationId, studentId: input.studentId, workshopId: w.id, status: "ACTIVE" },
            })
          : null;
        const hasValidReservation = !!reservation && reservation.expiresAt > now;

        if (hasValidReservation) {
          // El lugar ya estaba retenido para este alumno.
          if (w.registeredCount >= w.maxCapacity) throw Errors.workshopFull({ waitlistAvailable: true });
        } else {
          const held = await heldSeats(tx, w.id);
          const waiting = await waitingCount(tx, w.id);
          if (w.registeredCount + held >= w.maxCapacity || waiting > 0) {
            throw Errors.workshopFull({ waitlistAvailable: true });
          }
        }

        if (input.profile) await updateStudentProfile(tx, input.studentId, input.profile);
        const student = await tx.student.findUniqueOrThrow({ where: { id: input.studentId }, select: { fullName: true, classroom: true, semester: true } });
        if (!student.fullName || !student.classroom || !student.semester) {
          throw Errors.unprocessable("PROFILE_INCOMPLETE", "Completa tus datos antes de inscribirte.");
        }

        const res = await insertRegistration(tx, {
          studentId: input.studentId,
          w,
          source: "WEB",
          reservationId: hasValidReservation ? reservation!.id : null,
          ipHash: input.ipHash,
        });
        event = res.event;
        if (input.onCommitting) await input.onCommitting(tx, res.outcome);
        return res.outcome;
      },
      { label: "register_student" },
    );

    // ---- Post-COMMIT ----
    logger.info("registration_created", { registrationId: outcome.registrationId, workshop: outcome.workshop.slug });
    if (event) void publish(event);
    kickDispatcher();
    return outcome;
  } catch (err) {
    if (isUniqueViolation(err, "uq_registration_active_student_workshop")) throw Errors.alreadyRegistered();
    if (isCheckViolation(err, "workshops_no_overbooking_chk")) throw Errors.workshopFull({ waitlistAvailable: true });
    throw err;
  }
}

/** Cancelación (alumno o administrador) + promoción automática desde la lista de espera. */
export async function cancelRegistration(input: {
  registrationId: string;
  by: { type: "STUDENT"; studentId: string } | { type: "ADMIN"; adminId: string };
  reason?: string;
  ipHash?: string | null;
}): Promise<{ promoted: number }> {
  const events: RealtimeEvent[] = [];
  const result = await withTransaction(
    async (tx) => {
      events.length = 0; // la transacción puede reintentarse
      const pre = await tx.registration.findUnique({ where: { id: input.registrationId }, select: { workshopId: true, studentId: true } });
      if (!pre) throw Errors.notFound("La inscripción no existe.");
      if (input.by.type === "STUDENT" && pre.studentId !== input.by.studentId) throw Errors.notFound("La inscripción no existe.");

      const w = await lockWorkshop(tx, pre.workshopId);
      const [reg] = await tx.$queryRaw<{ id: string; status: string }[]>`
        SELECT id, status::text AS status FROM registrations WHERE id = ${input.registrationId}::uuid FOR UPDATE`;
      if (!reg || !(ACTIVE_STATUSES as readonly string[]).includes(reg.status)) {
        throw Errors.conflict("NOT_ACTIVE", "La inscripción ya no está activa.");
      }
      if (input.by.type === "STUDENT" && reg.status !== "REGISTERED") {
        throw Errors.conflict("CANNOT_CANCEL", "Esta inscripción ya no puede cancelarse en línea. Contacta a la coordinación.");
      }

      const updated = await tx.registration.update({
        where: { id: input.registrationId },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason?.slice(0, 200) ?? null },
        include: { student: true },
      });
      const { registered, capacity } = await decrementRegistered(tx, w.id);

      await audit(
        {
          action: "REGISTRATION_CANCELLED",
          adminId: input.by.type === "ADMIN" ? input.by.adminId : null,
          actorType: input.by.type,
          resourceType: "registration",
          resourceId: updated.id,
          metadata: { workshop: w.slug, code: updated.registrationCode, reason: input.reason ?? null, registered, capacity },
          ipHash: input.ipHash ?? null,
        },
        tx,
      );
      await notifyCancellation(tx, {
        registrationId: updated.id,
        studentName: updated.student.fullName ?? updated.student.email,
        email: updated.student.email,
        workshopName: w.name,
        code: updated.registrationCode,
        registered,
        capacity,
        available: capacity - registered,
        at: new Date(),
        by: input.by.type === "ADMIN" ? "Administrador" : "Estudiante",
      });
      events.push({ type: "registration.cancelled", workshopId: w.id, workshopName: w.name, registered, capacity, at: new Date().toISOString() });

      const promoted = await fillFromWaitlist(tx, { ...w, registeredCount: registered }, events);
      return { promoted };
    },
    { label: "cancel_registration" },
  );
  for (const e of events) void publish(e);
  kickDispatcher();
  return result;
}

/** Cambiar a un alumno de taller (admin). Conserva código y QR. */
export async function moveRegistration(input: { registrationId: string; targetWorkshopId: string; adminId: string; ipHash?: string | null }) {
  const events: RealtimeEvent[] = [];
  await withTransaction(
    async (tx) => {
      events.length = 0;
      const pre = await tx.registration.findUnique({ where: { id: input.registrationId } });
      if (!pre) throw Errors.notFound("La inscripción no existe.");
      if (pre.workshopId === input.targetWorkshopId) throw Errors.badRequest("El alumno ya está en ese taller.");
      await lockStudent(tx, pre.studentId);
      const locked = await lockWorkshops(tx, [pre.workshopId, input.targetWorkshopId]);
      const from = locked.get(pre.workshopId)!;
      const to = locked.get(input.targetWorkshopId)!;
      const [reg] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM registrations WHERE id = ${input.registrationId}::uuid FOR UPDATE`;
      if (!reg || !["REGISTERED"].includes(reg.status)) throw Errors.conflict("NOT_MOVABLE", "Solo se pueden mover inscripciones activas sin asistencia.");
      if (to.archivedAt || ["CANCELLED", "FINISHED"].includes(to.status)) throw Errors.workshopClosed();
      const dup = await tx.registration.findFirst({
        where: { studentId: pre.studentId, workshopId: to.id, status: { in: [...ACTIVE_STATUSES] } },
      });
      if (dup) throw Errors.alreadyRegistered();
      const held = await heldSeats(tx, to.id);
      if (to.registeredCount + held >= to.maxCapacity) throw Errors.workshopFull();

      const dec = await decrementRegistered(tx, from.id);
      const inc = await incrementRegistered(tx, to.id);
      await tx.registration.update({ where: { id: pre.id }, data: { workshopId: to.id, eventKey: to.eventKey } });
      await audit(
        {
          action: "STUDENT_MOVED",
          adminId: input.adminId,
          resourceType: "registration",
          resourceId: pre.id,
          metadata: { from: from.slug, to: to.slug },
          ipHash: input.ipHash ?? null,
        },
        tx,
      );
      const student = await tx.student.findUniqueOrThrow({ where: { id: pre.studentId } });
      await notifyStudentConfirmation(tx, pre.id, student.email, to.name);
      await evaluateCapacityAlerts(tx, to, inc.registered, inc.capacity);
      events.push(
        { type: "registration.cancelled", workshopId: from.id, workshopName: from.name, registered: dec.registered, capacity: dec.capacity, at: new Date().toISOString() },
        {
          type: "registration.created",
          workshopId: to.id,
          workshopName: to.name,
          studentName: student.fullName ?? "",
          registrationId: pre.id,
          registered: inc.registered,
          capacity: inc.capacity,
          at: new Date().toISOString(),
          source: "ADMIN",
        },
      );
      await fillFromWaitlist(tx, { ...from, registeredCount: dec.registered }, events);
    },
    { label: "move_registration" },
  );
  for (const e of events) void publish(e);
  kickDispatcher();
}

/** Vista pública (por publicId, identificador no adivinable). Sin correo ni teléfono. */
export async function getPublicRegistration(publicId: string) {
  const reg = await db().registration.findUnique({
    where: { publicId },
    include: { student: { select: { fullName: true } }, workshop: true, attendance: true },
  });
  if (!reg) return null;
  return {
    publicId: reg.publicId,
    code: reg.registrationCode,
    status: reg.status,
    studentName: reg.student.fullName,
    createdAt: reg.createdAt,
    checkedInAt: reg.attendance?.checkedInAt ?? null,
    workshop: {
      name: reg.workshop.name,
      slug: reg.workshop.slug,
      date: reg.workshop.date,
      startTime: reg.workshop.startTime,
      endTime: reg.workshop.endTime,
      location: reg.workshop.location,
      instructor: reg.workshop.instructorName,
      level: reg.workshop.level,
    },
    qrVersion: reg.qrVersion,
  };
}
