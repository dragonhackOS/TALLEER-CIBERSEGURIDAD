import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { json, parseJson, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { verifyCodeSchema } from "@/schemas";
import { verifyOtp } from "@/server/services/otp.service";
import { createStudentSession, setStudentCookie } from "@/server/auth/student-session";

export const runtime = "nodejs";

/** POST /api/auth/verify-code — valida el OTP y crea la sesión del alumno. */
export const POST = route(async (req: NextRequest) => {
  const { ip } = await publicRateLimit(req);
  const body = await parseJson(req, verifyCodeSchema(env().ALLOWED_EMAIL_DOMAIN));
  const { studentId, email } = await verifyOtp(body.email, body.code, ip);
  const { token, expiresAt } = await createStudentSession(studentId);
  const res = json({ ok: true, email, expiresAt: expiresAt.toISOString() });
  setStudentCookie(res, token);
  return res;
});
