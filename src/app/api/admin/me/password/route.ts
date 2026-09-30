import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { json, parseJson, route } from "@/server/http/handler";
import { changePasswordSchema } from "@/schemas";
import { requireAdmin, revokeAllAdminSessions, clearAdminCookie } from "@/server/auth/admin-session";
import { hashPassword, passwordStrengthError, verifyPassword } from "@/server/auth/password";
import { audit } from "@/server/services/audit.service";

export const runtime = "nodejs";

/** Cambio de contraseña propia: revoca TODAS las sesiones (incluida la actual). */
export const POST = route(async (req: NextRequest) => {
  const a = await requireAdmin(req);
  const body = await parseJson(req, changePasswordSchema);
  const admin = await db().admin.findUniqueOrThrow({ where: { id: a.adminId } });
  if (!(await verifyPassword(admin.passwordHash, body.currentPassword))) throw Errors.unauthorized("La contraseña actual es incorrecta.");
  const weak = passwordStrengthError(body.newPassword);
  if (weak) throw Errors.unprocessable("WEAK_PASSWORD", weak);
  await db().admin.update({ where: { id: a.adminId }, data: { passwordHash: await hashPassword(body.newPassword) } });
  await revokeAllAdminSessions(a.adminId);
  await audit({ action: "PASSWORD_CHANGED", adminId: a.adminId, ipHash: a.ipHash });
  const res = json({ ok: true, reauthenticate: true });
  clearAdminCookie(res);
  return res;
});
