import type { NextRequest } from "next/server";
import { env, adminNotificationEmails } from "@/lib/env";
import { json, parseJson, route } from "@/server/http/handler";
import { settingsSchema } from "@/schemas";
import { requireAdmin } from "@/server/auth/admin-session";
import { getBranding, updateBranding } from "@/server/services/admin.service";
import { turnstileEnabled } from "@/server/services/antibot";

export const runtime = "nodejs";

/** Configuración (solo SUPER_ADMIN). Los destinatarios se muestran enmascarados. */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req, "settings:manage");
  const e = env();
  const mask = (m: string) => m.replace(/^(.{2}).*(@.*)$/, "$1•••$2");
  return json({
    branding: await getBranding(),
    config: {
      allowedDomain: e.ALLOWED_EMAIL_DOMAIN,
      registrationPolicy: e.REGISTRATION_POLICY,
      otpMinutes: e.OTP_EXPIRATION_MINUTES,
      reservationMinutes: e.RESERVATION_TIMEOUT_MINUTES,
      sessionMinutes: e.SESSION_TIMEOUT_MINUTES,
      adminSessionHours: e.ADMIN_SESSION_HOURS,
      smtpConfigured: Boolean(e.SMTP_HOST),
      emailFrom: e.EMAIL_FROM,
      turnstile: turnstileEnabled(),
      timezone: e.TIMEZONE,
      notificationRecipients: adminNotificationEmails().map(mask),
    },
  });
});

export const PUT = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "settings:manage");
  const body = await parseJson(req, settingsSchema);
  return json({ branding: await updateBranding(body, { adminId: a.adminId, ipHash: a.ipHash }) });
});
