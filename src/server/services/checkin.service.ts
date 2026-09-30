import { db, withTransaction } from "@/lib/db";
import { verifyQrToken } from "@/lib/crypto";
import { Errors } from "@/lib/errors";
import type { AdminContext } from "@/server/auth/admin-session";
import { instructorWorkshopIds } from "@/server/auth/admin-session";
import { isScopedToAssignedWorkshops } from "@/server/auth/rbac";
import { audit } from "./audit.service";
import { publish } from "./realtime";
import type { CheckinMethod } from "@/generated/prisma/enums";

export interface CheckinResult {
  status: "CHECKED_IN" | "ALREADY_CHECKED_IN";
  registrationId: string;
  studentName: string;
  code: string;
  workshopName: string;
  classroom: string | null;
  semester: number | null;
  checkedInAt: Date;
}

/** Resuelve la inscripción a partir de QR firmado, código o ID. */
async function resolveRegistration(input: { token?: string; code?: string; registrationId?: string }) {
  if (input.token) {
    const parsed = verifyQrToken(input.token);
    if (!parsed) throw Errors.notFound("QR inválido o alterado.");
    const reg = await db().registration.findUnique({ where: { publicId: parsed.publicId } });
    if (!reg) throw Errors.notFound("QR inválido.");
    if (reg.qrVersion !== parsed.version) {
      throw Errors.conflict("QR_REVOKED", "Este QR fue reemplazado por uno nuevo. Solicita al alumno su QR vigente.");
    }
    return { reg, method: "QR" as CheckinMethod };
  }
  if (input.code) {
    const reg = await db().registration.findUnique({ where: { registrationCode: input.code.toUpperCase() } });
    if (!reg) throw Errors.notFound("No existe una inscripción con ese código.");
    return { reg, method: "CODE" as CheckinMethod };
  }
  const reg = await db().registration.findUnique({ where: { id: input.registrationId! } });
  if (!reg) throw Errors.notFound("Inscripción no encontrada.");
  return { reg, method: "MANUAL" as CheckinMethod };
}

export async function checkIn(
  admin: AdminContext,
  input: { token?: string; code?: string; registrationId?: string; workshopId?: string },
): Promise<CheckinResult> {
  const { reg, method } = await resolveRegistration(input);

  if (isScopedToAssignedWorkshops(admin.role)) {
    const allowed = await instructorWorkshopIds(admin.adminId);
    if (!allowed.includes(reg.workshopId)) throw Errors.forbidden("Esta inscripción pertenece a un taller que no tienes asignado.");
  }
  if (input.workshopId && input.workshopId !== reg.workshopId) {
    const w = await db().workshop.findUnique({ where: { id: reg.workshopId }, select: { name: true } });
    throw Errors.conflict("WRONG_WORKSHOP", `Esta inscripción corresponde a otro taller: ${w?.name ?? ""}.`);
  }

  const result = await withTransaction(
    async (tx) => {
      const [locked] = await tx.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM registrations WHERE id = ${reg.id}::uuid FOR UPDATE`;
      const full = await tx.registration.findUniqueOrThrow({
        where: { id: reg.id },
        include: { student: true, workshop: true, attendance: true },
      });
      const base = {
        registrationId: full.id,
        studentName: full.student.fullName ?? full.student.email,
        code: full.registrationCode,
        workshopName: full.workshop.name,
        classroom: full.student.classroom,
        semester: full.student.semester,
      };
      if (locked.status === "CHECKED_IN" && full.attendance) {
        return { ...base, status: "ALREADY_CHECKED_IN" as const, checkedInAt: full.attendance.checkedInAt };
      }
      if (locked.status === "CANCELLED") throw Errors.conflict("REGISTRATION_CANCELLED", "Esta inscripción está cancelada.");
      if (locked.status === "WAITLISTED") throw Errors.conflict("NOT_REGISTERED", "El alumno está en lista de espera, no inscrito.");

      const att = await tx.attendance.create({
        data: { registrationId: full.id, checkedInById: admin.adminId, method },
      });
      await tx.registration.update({ where: { id: full.id }, data: { status: "CHECKED_IN" } });
      await audit(
        {
          action: "CHECKIN",
          adminId: admin.adminId,
          resourceType: "registration",
          resourceId: full.id,
          metadata: { method, workshop: full.workshop.slug },
          ipHash: admin.ipHash,
        },
        tx,
      );
      return { ...base, status: "CHECKED_IN" as const, checkedInAt: att.checkedInAt, workshopId: full.workshopId };
    },
    { label: "checkin" },
  );

  if (result.status === "CHECKED_IN") {
    void publish({
      type: "checkin",
      workshopId: reg.workshopId,
      registrationId: result.registrationId,
      studentName: result.studentName,
      at: result.checkedInAt.toISOString(),
    });
  }
  return result;
}

export async function undoCheckIn(admin: AdminContext, registrationId: string) {
  await withTransaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM registrations WHERE id = ${registrationId}::uuid FOR UPDATE`;
    if (!locked) throw Errors.notFound();
    if (locked.status !== "CHECKED_IN") throw Errors.conflict("NOT_CHECKED_IN", "La inscripción no tiene asistencia registrada.");
    await tx.attendance.deleteMany({ where: { registrationId } });
    await tx.registration.update({ where: { id: registrationId }, data: { status: "REGISTERED" } });
    await audit({ action: "CHECKIN_UNDONE", adminId: admin.adminId, resourceType: "registration", resourceId: registrationId, ipHash: admin.ipHash }, tx);
  });
}

export async function markNoShow(admin: AdminContext, registrationId: string) {
  const res = await db().registration.updateMany({ where: { id: registrationId, status: "REGISTERED" }, data: { status: "NO_SHOW" } });
  if (res.count === 0) throw Errors.conflict("NOT_REGISTERED", "Solo inscripciones sin asistencia pueden marcarse como ausentes.");
  await audit({ action: "NO_SHOW_MARKED", adminId: admin.adminId, resourceType: "registration", resourceId: registrationId, ipHash: admin.ipHash });
}
