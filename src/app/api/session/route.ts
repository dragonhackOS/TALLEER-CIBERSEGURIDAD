import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { clearStudentCookie, getStudent, revokeStudentSession } from "@/server/auth/student-session";
import { releaseStudentReservations } from "@/server/services/reservation.service";
import { isAppError } from "@/lib/errors";

export const runtime = "nodejs";

/** GET /api/session — estado de la sesión del alumno (no la renueva). */
export const GET = route(async (req: NextRequest) => {
  await publicRateLimit(req);
  try {
    const s = await getStudent(req, { touch: false });
    if (!s) return json({ authenticated: false });
    const student = await db().student.findUnique({
      where: { id: s.studentId },
      select: { fullName: true, classroom: true, semester: true, phone: true, programmingExperience: true, securityExperience: true, ctfBefore: true },
    });
    return json({ authenticated: true, email: s.email, expiresAt: s.expiresAt.toISOString(), serverTime: new Date().toISOString(), profile: student });
  } catch (err) {
    if (isAppError(err) && err.code === "SESSION_EXPIRED") {
      const res = json({ authenticated: false, expired: true });
      clearStudentCookie(res);
      return res;
    }
    throw err;
  }
});

/** DELETE /api/session — cierra sesión y libera reservas. */
export const DELETE = route(async (req: NextRequest) => {
  let s = null;
  try {
    s = await getStudent(req, { touch: false });
  } catch {
    /* ya expirada */
  }
  if (s) {
    await revokeStudentSession(s.sessionId);
    await releaseStudentReservations(s.studentId, "LOGOUT");
  }
  const res = json({ ok: true });
  clearStudentCookie(res);
  return res;
});
