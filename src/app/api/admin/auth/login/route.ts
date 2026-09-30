import type { NextRequest } from "next/server";
import { json, parseJson, route, clientIp } from "@/server/http/handler";
import { adminLoginSchema } from "@/schemas";
import { checkRateLimit, resetRateLimit, RULES } from "@/server/rate-limit";
import { loginAdmin, setAdminCookie } from "@/server/auth/admin-session";

export const runtime = "nodejs";

/** POST /api/admin/auth/login — 5 intentos / 15 min por correo+IP. */
export const POST = route(async (req: NextRequest) => {
  const ip = clientIp(req);
  const body = await parseJson(req, adminLoginSchema);
  await checkRateLimit(RULES.adminLoginIp, ip);
  await checkRateLimit(RULES.adminLogin, `${body.email}|${ip}`);
  const result = await loginAdmin({ ...body, ip, userAgent: req.headers.get("user-agent") });
  if ("totpRequired" in result) return json({ totpRequired: true }, 200);
  await resetRateLimit(RULES.adminLogin, `${body.email}|${ip}`);
  const res = json({ ok: true, admin: result.admin });
  setAdminCookie(res, result.token);
  return res;
});
