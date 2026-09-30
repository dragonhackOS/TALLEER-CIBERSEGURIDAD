import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { closeRedis } from "@/lib/redis";
import { registerStudent } from "@/server/services/registration.service";
import { createReservation } from "@/server/services/reservation.service";
import { makeStudent, makeWorkshop, resetDatabase } from "./helpers/db";

/**
 * PRUEBA OBLIGATORIA DE CONCURRENCIA
 * Taller con max_capacity = 25 y 100 solicitudes simultáneas:
 *   → exactamente 25 inscripciones creadas y 75 rechazadas.
 *   → NUNCA 26 inscritos.
 */
describe("Cupo estricto bajo concurrencia", () => {
  beforeEach(resetDatabase);
  afterAll(async () => {
    await closeRedis();
  });

  it("100 inscripciones simultáneas → 25 creadas, 75 rechazadas (WORKSHOP_FULL)", async () => {
    const w = await makeWorkshop({ maxCapacity: 25 });
    const students = await Promise.all(Array.from({ length: 100 }, (_, i) => makeStudent(i)));

    const results = await Promise.allSettled(students.map((s) => registerStudent({ studentId: s.id, workshopId: w.id })));

    const ok = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    const reasons = new Set(rejected.map((r) => (r.reason as { code?: string }).code));

    expect(ok).toHaveLength(25);
    expect(rejected).toHaveLength(75);
    expect([...reasons]).toEqual(["WORKSHOP_FULL"]);

    const count = await db().registration.count({ where: { workshopId: w.id, status: "REGISTERED" } });
    const fresh = await db().workshop.findUniqueOrThrow({ where: { id: w.id } });
    expect(count).toBe(25);
    expect(fresh.registeredCount).toBe(25);
    expect(fresh.registeredCount).toBeLessThanOrEqual(fresh.maxCapacity);
    expect(fresh.status).toBe("FULL");

    // Códigos y publicId únicos
    const regs = await db().registration.findMany({ where: { workshopId: w.id } });
    expect(new Set(regs.map((r) => r.registrationCode)).size).toBe(25);
    expect(new Set(regs.map((r) => r.publicId)).size).toBe(25);
  });

  it("100 reservas simultáneas → 25 lugares retenidos como máximo", async () => {
    const w = await makeWorkshop({ maxCapacity: 25 });
    const students = await Promise.all(Array.from({ length: 100 }, (_, i) => makeStudent(`r${i}`)));
    const results = await Promise.allSettled(students.map((s) => createReservation(s.id, w.id)));
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ reservationId: string }>[];
    expect(ok).toHaveLength(25);

    // Con las 25 reservas, un alumno sin reserva no puede inscribirse.
    const outsider = await makeStudent("outsider");
    await expect(registerStudent({ studentId: outsider.id, workshopId: w.id })).rejects.toMatchObject({ code: "WORKSHOP_FULL" });

    // Los 25 con reserva sí se inscriben, todos a la vez.
    const byStudent = new Map(
      ok.map((r, i) => [r.value.reservationId, i]),
    );
    const reservations = await db().reservation.findMany({ where: { workshopId: w.id, status: "ACTIVE" } });
    expect(reservations).toHaveLength(25);
    expect(byStudent.size).toBe(25);
    const regs = await Promise.allSettled(
      reservations.map((r) => registerStudent({ studentId: r.studentId, workshopId: w.id, reservationId: r.id })),
    );
    expect(regs.filter((r) => r.status === "fulfilled")).toHaveLength(25);
    const fresh = await db().workshop.findUniqueOrThrow({ where: { id: w.id } });
    expect(fresh.registeredCount).toBe(25);
  });

  it("mezcla simultánea de reservas e inscripciones directas nunca supera el cupo", async () => {
    const w = await makeWorkshop({ maxCapacity: 10 });
    const students = await Promise.all(Array.from({ length: 60 }, (_, i) => makeStudent(`m${i}`)));
    await Promise.allSettled(
      students.map((s, i) => (i % 2 === 0 ? createReservation(s.id, w.id) : registerStudent({ studentId: s.id, workshopId: w.id }))),
    );
    const fresh = await db().workshop.findUniqueOrThrow({ where: { id: w.id } });
    const held = await db().reservation.count({ where: { workshopId: w.id, status: "ACTIVE", expiresAt: { gt: new Date() } } });
    expect(fresh.registeredCount + held).toBeLessThanOrEqual(10);
    expect(fresh.registeredCount).toBeLessThanOrEqual(10);
  });

  it("el mismo alumno enviando 50 solicitudes simultáneas obtiene una sola inscripción", async () => {
    const w = await makeWorkshop({ maxCapacity: 25 });
    const s = await makeStudent("dup");
    const results = await Promise.allSettled(Array.from({ length: 50 }, () => registerStudent({ studentId: s.id, workshopId: w.id })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const reasons = new Set(
      (results.filter((r) => r.status === "rejected") as PromiseRejectedResult[]).map((r) => (r.reason as { code?: string }).code),
    );
    expect([...reasons]).toEqual(["ALREADY_REGISTERED"]);
    expect(await db().registration.count({ where: { studentId: s.id } })).toBe(1);
  });

  it("la base de datos rechaza físicamente el sobrecupo (CHECK constraint)", async () => {
    const w = await makeWorkshop({ maxCapacity: 2 });
    await expect(
      db().$executeRaw`UPDATE workshops SET registered_count = 3 WHERE id = ${w.id}::uuid`,
    ).rejects.toThrow();
  });
});
