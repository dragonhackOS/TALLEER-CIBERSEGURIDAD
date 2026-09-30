import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { closeRedis, redis } from "@/lib/redis";
import { hashOtp, signQrToken, verifyQrToken, sha256 } from "@/lib/crypto";
import { isInstitutionalEmail } from "@/lib/email-domain";
import { requestOtp, verifyOtp } from "@/server/services/otp.service";
import { cancelRegistration, registerStudent } from "@/server/services/registration.service";
import { createReservation, expireReservations } from "@/server/services/reservation.service";
import { joinWaitlist, processWaitlists } from "@/server/services/waitlist.service";
import { changeCapacity } from "@/server/services/workshop.service";
import { beginIdempotent, completeIdempotent } from "@/server/services/idempotency";
import { checkRateLimit, RULES } from "@/server/rate-limit";
import { can } from "@/server/auth/rbac";
import { getStudent, createStudentSession } from "@/server/auth/student-session";
import { checkIn } from "@/server/services/checkin.service";
import { sanitizeCell } from "@/server/services/export.service";
import { makeAdmin, makeStudent, makeWorkshop, profile, resetDatabase } from "./helpers/db";

beforeEach(resetDatabase);
afterAll(async () => {
  await closeRedis();
});

describe("Dominio de correo institucional", () => {
  const D = "prepayucatan.com";
  it.each([
    ["juan.perez@prepayucatan.com", true],
    ["ricardo.lara@prepayucatan.com", true],
    ["JUAN.PEREZ@PrepaYucatan.com", true],
    ["juan@gmail.com", false],
    ["juan@hotmail.com", false],
    ["juan@prepayucatan.com.mx", false],
    ["juan@fakeprepayucatan.com", false],
    ["juan@sub.prepayucatan.com", false],
    ["juan+alias@prepayucatan.com", false],
    ["juan@prepayucatan.com@evil.com", false],
    [".juan@prepayucatan.com", false],
    ["ju..an@prepayucatan.com", false],
    ["juan@prepayucatаn.com", false], // "а" cirílica
    ["", false],
  ])("%s → %s", (email, ok) => {
    expect(isInstitutionalEmail(email, D)).toBe(ok);
  });

  it("el backend rechaza dominios no permitidos aunque el cliente los envíe", async () => {
    await expect(requestOtp("juan@prepayucatan.com.mx", "1.1.1.1")).rejects.toMatchObject({ code: "INVALID_EMAIL_DOMAIN" });
  });
});

describe("OTP", () => {
  const email = "ana.chan@prepayucatan.com";

  async function forceCode(code = "123456") {
    const r = await db().emailVerification.findFirstOrThrow({ where: { email }, orderBy: { createdAt: "desc" } });
    await db().emailVerification.update({ where: { id: r.id }, data: { codeHash: hashOtp(email, code) } });
    return r;
  }

  it("nunca se guarda en texto plano", async () => {
    await requestOtp(email, "1.1.1.1");
    const r = await db().emailVerification.findFirstOrThrow({ where: { email } });
    expect(r.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("código correcto verifica y es de un solo uso", async () => {
    await requestOtp(email, "1.1.1.1");
    await forceCode();
    const ok = await verifyOtp(email, "123456", "1.1.1.1");
    expect(ok.email).toBe(email);
    await expect(verifyOtp(email, "123456", "1.1.1.1")).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("código incorrecto es rechazado", async () => {
    await requestOtp(email, "1.1.1.1");
    await forceCode();
    await expect(verifyOtp(email, "000000", "1.1.1.1")).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("código expirado es rechazado", async () => {
    await requestOtp(email, "1.1.1.1");
    const r = await forceCode();
    await db().emailVerification.update({ where: { id: r.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(verifyOtp(email, "123456", "1.1.1.1")).rejects.toMatchObject({ code: "OTP_INVALID" });
  });

  it("máximo de intentos por código", async () => {
    await requestOtp(email, "1.1.1.1");
    const r = await forceCode();
    await db().emailVerification.update({ where: { id: r.id }, data: { attempts: 5 } });
    await expect(verifyOtp(email, "123456", "1.1.1.1")).rejects.toMatchObject({ code: "OTP_LOCKED" });
  });

  it("rate limit: máximo 3 códigos cada 15 minutos por correo", async () => {
    await requestOtp(email, "1.1.1.1");
    await requestOtp(email, "1.1.1.1");
    await requestOtp(email, "1.1.1.1");
    await expect(requestOtp(email, "1.1.1.1")).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("rate limit: máximo 5 verificaciones cada 15 minutos", async () => {
    await requestOtp(email, "1.1.1.1");
    await forceCode();
    for (let i = 0; i < 4; i++) await expect(verifyOtp(email, "000000", "1.1.1.1")).rejects.toBeTruthy();
    await expect(verifyOtp(email, "000000", "1.1.1.1")).rejects.toMatchObject({ code: expect.stringMatching(/OTP_LOCKED|OTP_INVALID/) });
    await expect(verifyOtp(email, "123456", "1.1.1.1")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("Rate limiting genérico", () => {
  it("responde 429 al superar el límite", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit(RULES.formIp, "9.9.9.9");
    await expect(checkRateLimit(RULES.formIp, "9.9.9.9")).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });
});

describe("Inscripciones", () => {
  it("inscripción duplicada: 'Ya tienes una inscripción activa.'", async () => {
    const w = await makeWorkshop();
    const s = await makeStudent(1);
    await registerStudent({ studentId: s.id, workshopId: w.id });
    await expect(registerStudent({ studentId: s.id, workshopId: w.id })).rejects.toMatchObject({
      code: "ALREADY_REGISTERED",
      message: "Ya tienes una inscripción activa.",
    });
  });

  it("política un taller por evento", async () => {
    const a = await makeWorkshop({ eventKey: "feria" });
    const b = await makeWorkshop({ eventKey: "feria" });
    const s = await makeStudent(2);
    await registerStudent({ studentId: s.id, workshopId: a.id });
    await expect(registerStudent({ studentId: s.id, workshopId: b.id })).rejects.toMatchObject({ code: "ALREADY_REGISTERED" });
  });

  it("taller cerrado/borrador no acepta inscripciones", async () => {
    const w = await makeWorkshop({ status: "CLOSED" });
    const s = await makeStudent(3);
    await expect(registerStudent({ studentId: s.id, workshopId: w.id })).rejects.toMatchObject({ code: "WORKSHOP_CLOSED" });
  });

  it("notificaciones se encolan SOLO tras el commit y a los destinatarios configurados", async () => {
    const w = await makeWorkshop({ maxCapacity: 1 });
    const s1 = await makeStudent(4);
    const s2 = await makeStudent(5);
    await registerStudent({ studentId: s1.id, workshopId: w.id });
    await expect(registerStudent({ studentId: s2.id, workshopId: w.id })).rejects.toMatchObject({ code: "WORKSHOP_FULL" });
    const emails = await db().emailLog.findMany();
    const admin = emails.filter((e) => e.template === "ADMIN_NEW_REGISTRATION");
    expect(admin).toHaveLength(1);
    expect(admin[0].toAddresses.sort()).toEqual(["dragonhackprime@gmail.com", "gretty.escalante@prepayucatan.com"]);
    expect(emails.filter((e) => e.toAddresses.includes(s2.email))).toHaveLength(0);
  });

  it("alertas de capacidad: 80%, 90%, último lugar y lleno, sin repetirse", async () => {
    const w = await makeWorkshop({ maxCapacity: 10 });
    const students = await Promise.all(Array.from({ length: 10 }, (_, i) => makeStudent(`c${i}`)));
    for (const s of students) await registerStudent({ studentId: s.id, workshopId: w.id });
    const t = (await db().emailLog.findMany({ where: { relatedType: "workshop" } })).map((e) => e.template).sort();
    expect(t).toEqual(["ADMIN_CAPACITY_ALERT", "ADMIN_CAPACITY_ALERT", "ADMIN_LAST_SEAT", "ADMIN_WORKSHOP_FULL"]);
    // cancelar y volver a llenar NO repite alertas
    const reg = await db().registration.findFirstOrThrow({ where: { workshopId: w.id } });
    await cancelRegistration({ registrationId: reg.id, by: { type: "STUDENT", studentId: reg.studentId } });
    const extra = await makeStudent("c-extra");
    await registerStudent({ studentId: extra.id, workshopId: w.id });
    expect(await db().emailLog.count({ where: { relatedType: "workshop" } })).toBe(4);
  });
});

describe("Idempotencia", () => {
  it("misma clave → misma respuesta, sin segunda inscripción", async () => {
    const w = await makeWorkshop();
    const s = await makeStudent("idem");
    const scope = `registration:${s.id}`;
    const first = await beginIdempotent(scope, "11111111-1111-4111-8111-111111111111", "hashA");
    expect(first.kind).toBe("new");
    if (first.kind !== "new") return;
    await registerStudent({
      studentId: s.id,
      workshopId: w.id,
      onCommitting: (tx, o) => completeIdempotent(first.id, 201, { publicId: o.publicId }, tx),
    });
    const replay = await beginIdempotent(scope, "11111111-1111-4111-8111-111111111111", "hashA");
    expect(replay.kind).toBe("replay");
    await expect(beginIdempotent(scope, "11111111-1111-4111-8111-111111111111", "hashB")).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
    expect(await db().registration.count({ where: { studentId: s.id } })).toBe(1);
  });
});

describe("Reservas", () => {
  it("una reserva vigente retiene el lugar y al expirar lo libera", async () => {
    const w = await makeWorkshop({ maxCapacity: 1 });
    const a = await makeStudent("ra");
    const b = await makeStudent("rb");
    const r = await createReservation(a.id, w.id);
    await expect(createReservation(b.id, w.id)).rejects.toMatchObject({ code: "WORKSHOP_FULL" });
    await expect(registerStudent({ studentId: b.id, workshopId: w.id })).rejects.toMatchObject({ code: "WORKSHOP_FULL" });
    await db().reservation.update({ where: { id: r.reservationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expireReservations();
    await expect(registerStudent({ studentId: b.id, workshopId: w.id })).resolves.toMatchObject({ registered: 1 });
  });

  it("la reserva se convierte en inscripción", async () => {
    const w = await makeWorkshop({ maxCapacity: 3 });
    const s = await makeStudent("rc");
    const r = await createReservation(s.id, w.id);
    await registerStudent({ studentId: s.id, workshopId: w.id, reservationId: r.reservationId, profile: profile() });
    const res = await db().reservation.findUniqueOrThrow({ where: { id: r.reservationId } });
    expect(res.status).toBe("CONVERTED");
  });
});

describe("Lista de espera", () => {
  it("cancelación promueve automáticamente al primero de la lista", async () => {
    const w = await makeWorkshop({ maxCapacity: 1 });
    const a = await makeStudent("wa");
    const b = await makeStudent("wb");
    const c = await makeStudent("wc");
    await expect(joinWaitlist({ studentId: b.id, workshopId: w.id, profile: profile("Beto Waitlist") })).rejects.toMatchObject({ code: "SEATS_AVAILABLE" });
    const reg = await registerStudent({ studentId: a.id, workshopId: w.id });
    const pb = await joinWaitlist({ studentId: b.id, workshopId: w.id, profile: profile("Beto Waitlist") });
    const pc = await joinWaitlist({ studentId: c.id, workshopId: w.id, profile: profile("Carla Waitlist") });
    expect([pb.position, pc.position]).toEqual([1, 2]);
    await expect(joinWaitlist({ studentId: c.id, workshopId: w.id, profile: profile("Carla Waitlist") })).rejects.toMatchObject({ code: "ALREADY_WAITLISTED" });

    const res = await cancelRegistration({ registrationId: reg.registrationId, by: { type: "STUDENT", studentId: a.id } });
    expect(res.promoted).toBe(1);
    const bReg = await db().registration.findFirst({ where: { studentId: b.id, status: "REGISTERED" } });
    expect(bReg?.source).toBe("WAITLIST");
    const fresh = await db().workshop.findUniqueOrThrow({ where: { id: w.id } });
    expect(fresh.registeredCount).toBe(1);
    expect(await db().waitlistEntry.count({ where: { workshopId: w.id, status: "WAITING" } })).toBe(1);
    const promotedMail = await db().emailLog.count({ where: { template: "ADMIN_WAITLIST_PROMOTED" } });
    expect(promotedMail).toBe(1);
  });

  it("aumento de capacidad y reservas vencidas promueven la lista", async () => {
    const w = await makeWorkshop({ maxCapacity: 1 });
    const a = await makeStudent("xa");
    const b = await makeStudent("xb");
    await registerStudent({ studentId: a.id, workshopId: w.id });
    await joinWaitlist({ studentId: b.id, workshopId: w.id, profile: profile() });
    const admin = await makeAdmin("ADMIN");
    const r = await changeCapacity(w.id, 2, admin.id, null);
    expect(r.promoted).toBe(1);
    expect(await processWaitlists()).toBe(0);
  });
});

describe("Cambio de capacidad", () => {
  it("no permite capacidad menor a los inscritos", async () => {
    const w = await makeWorkshop({ maxCapacity: 5 });
    for (let i = 0; i < 3; i++) await registerStudent({ studentId: (await makeStudent(`cap${i}`)).id, workshopId: w.id });
    const admin = await makeAdmin("ADMIN");
    await expect(changeCapacity(w.id, 2, admin.id, null)).rejects.toMatchObject({
      code: "CAPACITY_BELOW_REGISTERED",
      message: "No puedes establecer una capacidad inferior al número actual de estudiantes inscritos.",
    });
    await expect(changeCapacity(w.id, 3, admin.id, null)).resolves.toMatchObject({ to: 3 });
    expect((await db().workshop.findUniqueOrThrow({ where: { id: w.id } })).status).toBe("FULL");
    const logs = await db().auditLog.count({ where: { action: "CAPACITY_CHANGED" } });
    expect(logs).toBe(1);
  });
});

describe("RBAC", () => {
  it("permisos por rol", () => {
    expect(can("SUPER_ADMIN", "admins:manage")).toBe(true);
    expect(can("ADMIN", "admins:manage")).toBe(false);
    expect(can("ADMIN", "workshops:write")).toBe(true);
    expect(can("INSTRUCTOR", "workshops:write")).toBe(false);
    expect(can("INSTRUCTOR", "checkin:write")).toBe(true);
    expect(can("CHECKIN_STAFF", "checkin:write")).toBe(true);
    expect(can("CHECKIN_STAFF", "registrations:read")).toBe(false);
    expect(can("VIEWER", "registrations:read")).toBe(true);
    expect(can("VIEWER", "registrations:write")).toBe(false);
    expect(can("VIEWER", "exports:create")).toBe(false);
  });

  it("un instructor no puede hacer check-in en talleres no asignados", async () => {
    const w = await makeWorkshop();
    const s = await makeStudent("inst");
    const reg = await registerStudent({ studentId: s.id, workshopId: w.id });
    const inst = await makeAdmin("INSTRUCTOR");
    const ctx = { sessionId: "x", adminId: inst.id, email: inst.email, name: inst.name, role: "INSTRUCTOR" as const, ipHash: null, totpEnabled: false };
    await expect(checkIn(ctx, { code: reg.code })).rejects.toMatchObject({ status: 403 });
  });
});

describe("Check-in y QR", () => {
  it("QR firmado; alterado es rechazado; segundo uso informa hora", async () => {
    const w = await makeWorkshop();
    const s = await makeStudent("qr");
    const reg = await registerStudent({ studentId: s.id, workshopId: w.id });
    const token = signQrToken(reg.publicId, 1);
    expect(token).not.toContain(s.email);
    expect(verifyQrToken(token)).toEqual({ publicId: reg.publicId, version: 1 });
    expect(verifyQrToken(token.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).toBeNull();

    const staff = await makeAdmin("CHECKIN_STAFF");
    const ctx = { sessionId: "x", adminId: staff.id, email: staff.email, name: staff.name, role: "CHECKIN_STAFF" as const, ipHash: null, totpEnabled: false };
    const first = await checkIn(ctx, { token });
    expect(first.status).toBe("CHECKED_IN");
    const second = await checkIn(ctx, { token });
    expect(second.status).toBe("ALREADY_CHECKED_IN");
    expect(second.checkedInAt.getTime()).toBe(first.checkedInAt.getTime());
    expect(await db().attendance.count()).toBe(1);
  });

  it("QR regenerado invalida el anterior", async () => {
    const w = await makeWorkshop();
    const s = await makeStudent("qr2");
    const reg = await registerStudent({ studentId: s.id, workshopId: w.id });
    const old = signQrToken(reg.publicId, 1);
    await db().registration.update({ where: { id: reg.registrationId }, data: { qrVersion: 2 } });
    const staff = await makeAdmin("CHECKIN_STAFF");
    const ctx = { sessionId: "x", adminId: staff.id, email: staff.email, name: staff.name, role: "CHECKIN_STAFF" as const, ipHash: null, totpEnabled: false };
    await expect(checkIn(ctx, { token: old })).rejects.toMatchObject({ code: "QR_REVOKED" });
  });
});

describe("Sesión del alumno", () => {
  function reqWith(token: string) {
    return new NextRequest("http://localhost:3000/api/session", { headers: { cookie: `py_st=${token}` } });
  }

  it("expira por inactividad, libera la reserva y bloquea el formulario", async () => {
    const w = await makeWorkshop({ maxCapacity: 1 });
    const s = await makeStudent("sess");
    const { token } = await createStudentSession(s.id);
    await createReservation(s.id, w.id);
    expect(await getStudent(reqWith(token))).toMatchObject({ studentId: s.id });
    await db().studentSession.updateMany({ where: { tokenHash: sha256(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(getStudent(reqWith(token))).rejects.toMatchObject({ code: "SESSION_EXPIRED" });
    expect(await db().reservation.count({ where: { studentId: s.id, status: "ACTIVE" } })).toBe(0);
    expect(await getStudent(reqWith(token))).toBeNull();
  });
});

describe("Auditoría", () => {
  it("los registros no pueden modificarse ni eliminarse", async () => {
    const w = await makeWorkshop();
    await registerStudent({ studentId: (await makeStudent("aud")).id, workshopId: w.id });
    const log = await db().auditLog.findFirstOrThrow();
    await expect(db().auditLog.delete({ where: { id: log.id } })).rejects.toThrow();
    await expect(db().auditLog.update({ where: { id: log.id }, data: { action: "X" } })).rejects.toThrow();
  });
});

describe("Exportación", () => {
  it("neutraliza fórmulas (CSV injection)", () => {
    expect(sanitizeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(sanitizeCell("+1")).toBe("'+1");
    expect(sanitizeCell("Juan")).toBe("Juan");
  });
});

describe("Redis", () => {
  it("disponible para pruebas", async () => {
    expect(await redis().ping()).toBe("PONG");
  });
});
