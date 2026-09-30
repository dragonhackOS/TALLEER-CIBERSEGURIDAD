import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { json, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { getBranding } from "@/server/services/admin.service";

export const runtime = "nodejs";

/** GET /api/config — configuración pública (nunca incluye destinatarios ni secretos). */
export const GET = route(async (req: NextRequest) => {
  await publicRateLimit(req);
  const e = env();
  return json({
    allowedDomain: e.ALLOWED_EMAIL_DOMAIN,
    otpMinutes: e.OTP_EXPIRATION_MINUTES,
    reservationMinutes: e.RESERVATION_TIMEOUT_MINUTES,
    sessionMinutes: e.SESSION_TIMEOUT_MINUTES,
    turnstileSiteKey: e.TURNSTILE_SITE_KEY || null,
    branding: await getBranding(),
  });
});
