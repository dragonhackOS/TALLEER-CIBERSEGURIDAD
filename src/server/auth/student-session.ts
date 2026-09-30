import type { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { Errors } from "@/lib/errors";
import { cookieName, sessionCookieOptions } from "@/server/http/cookies";
import { releaseStudentReservations } from "@/server/services/reservation.service";

/**
 * Sesión del alumno: se crea SOLO después de verificar el OTP.
 * Expira tras SESSION_TIMEOUT_MINUTES de inactividad (renovación deslizante).
 * El token viaja en cookie HttpOnly + SameSite=Strict; en BD solo se guarda su hash.
 */
export interface StudentContext {
  sessionId: string;
  studentId: string;
  email: string;
  expiresAt: Date;
}

function timeoutMs() {
  return env().SESSION_TIMEOUT_MINUTES * 60_000;
}

export async function createStudentSession(studentId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + timeoutMs());
  // Una sola sesión activa por alumno (previene fijación y sesiones huérfanas).
  await db().studentSession.updateMany({
    where: { studentId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await db().studentSession.create({ data: { tokenHash: sha256(token), studentId, expiresAt } });
  return { token, expiresAt };
}

export function setStudentCookie(res: NextResponse, token: string) {
  // Cookie de sesión del navegador; la expiración real la controla el servidor.
  res.cookies.set(cookieName("st"), token, sessionCookieOptions(24 * 60 * 60));
}

export function clearStudentCookie(res: NextResponse) {
  res.cookies.set(cookieName("st"), "", { ...sessionCookieOptions(0), maxAge: 0 });
}

/**
 * Obtiene la sesión del alumno. Si existe pero expiró: se invalida, se liberan
 * sus reservas y se lanza SESSION_EXPIRED (bloquea formularios antiguos).
 */
export async function getStudent(req: NextRequest, opts: { touch?: boolean } = {}): Promise<StudentContext | null> {
  const token = req.cookies.get(cookieName("st"))?.value;
  if (!token || token.length > 100) return null;
  const session = await db().studentSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { student: { select: { email: true } } },
  });
  if (!session || session.revokedAt) return null;
  const now = new Date();
  if (session.expiresAt <= now) {
    await db().studentSession.update({ where: { id: session.id }, data: { revokedAt: now } });
    await releaseStudentReservations(session.studentId, "SESSION_EXPIRED");
    throw Errors.sessionExpired();
  }
  let expiresAt = session.expiresAt;
  if (opts.touch) {
    expiresAt = new Date(now.getTime() + timeoutMs());
    await db().studentSession.update({ where: { id: session.id }, data: { lastSeenAt: now, expiresAt } });
  }
  return { sessionId: session.id, studentId: session.studentId, email: session.student.email, expiresAt };
}

export async function requireStudent(req: NextRequest, opts: { touch?: boolean } = { touch: true }) {
  const s = await getStudent(req, opts);
  if (!s) throw Errors.unauthorized("Verifica tu correo institucional para continuar.");
  return s;
}

export async function revokeStudentSession(sessionId: string) {
  await db().studentSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}
