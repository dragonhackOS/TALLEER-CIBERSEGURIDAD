import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { json, parseJson, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { requestCodeSchema } from "@/schemas";
import { requestOtp } from "@/server/services/otp.service";
import { checkHoneypot, requireChallengeIfSuspicious } from "@/server/services/antibot";

export const runtime = "nodejs";

/** POST /api/auth/request-code — envía un OTP al correo institucional. */
export const POST = route(async (req: NextRequest) => {
  const { ip } = await publicRateLimit(req);
  const body = await parseJson(req, requestCodeSchema(env().ALLOWED_EMAIL_DOMAIN));
  await checkHoneypot(body.website_url, ip);
  await requireChallengeIfSuspicious(body.turnstileToken, ip);
  const res = await requestOtp(body.email, ip);
  return json({ ok: true, expiresInSeconds: res.expiresInSeconds, message: "Te enviamos un código de 6 dígitos." });
});
