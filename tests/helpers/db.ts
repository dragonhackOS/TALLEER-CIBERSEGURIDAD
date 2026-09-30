import { db } from "@/lib/db";
import { redis } from "@/lib/redis";
import { randomUUID } from "node:crypto";
import { hashPassword } from "@/server/auth/password";
import type { AdminRole } from "@/generated/prisma/enums";

/** Limpia todas las tablas (la BD de pruebas permite deshabilitar el trigger de auditoría). */
export async function resetDatabase() {
  await db().$executeRawUnsafe(`ALTER TABLE audit_logs DISABLE TRIGGER USER`);
  await db().$executeRawUnsafe(`
    TRUNCATE attendances, waitlist_entries, reservations, registrations, capacity_notification_events,
             email_logs, idempotency_keys, email_verifications, student_sessions, students,
             audit_logs, admin_sessions, workshops, admins, settings RESTART IDENTITY CASCADE`);
  await db().$executeRawUnsafe(`ALTER TABLE audit_logs ENABLE TRIGGER USER`);
  await redis().flushdb();
}

let seq = 0;
export async function makeWorkshop(overrides: Partial<{ maxCapacity: number; status: "OPEN" | "DRAFT" | "CLOSED"; eventKey: string; name: string }> = {}) {
  seq++;
  return db().workshop.create({
    data: {
      slug: `taller-${seq}-${randomUUID().slice(0, 6)}`,
      name: overrides.name ?? `Taller ${seq}`,
      description: "Taller de prueba para concurrencia.",
      instructorName: "Instructor",
      date: new Date("2026-10-10T00:00:00Z"),
      startTime: "10:00",
      endTime: "13:00",
      location: "Laboratorio",
      level: "PRINCIPIANTE",
      maxCapacity: overrides.maxCapacity ?? 25,
      status: overrides.status ?? "OPEN",
      codePrefix: "TST",
      eventKey: overrides.eventKey ?? "default",
    },
  });
}

export async function makeStudent(i: number | string, complete = true) {
  return db().student.create({
    data: {
      email: `alumno.${i}.${randomUUID().slice(0, 6)}@prepayucatan.com`,
      emailVerifiedAt: new Date(),
      ...(complete ? { fullName: `Alumno Prueba ${i}`, classroom: "31", semester: 3, privacyAcceptedAt: new Date() } : {}),
    },
  });
}

export async function makeAdmin(role: AdminRole, email = `${role.toLowerCase()}-${randomUUID().slice(0, 6)}@prepayucatan.com`) {
  return db().admin.create({ data: { email, name: role, role, passwordHash: await hashPassword("Contraseña-Segura-123") } });
}

export const profile = (name = "Juan Pérez López") => ({
  fullName: name,
  classroom: "31",
  semester: 3,
  privacyAccepted: true as const,
});
