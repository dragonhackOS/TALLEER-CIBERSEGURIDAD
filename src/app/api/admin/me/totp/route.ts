import type { NextRequest } from "next/server";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { Errors } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { json, parseJson, route } from "@/server/http/handler";
import { requireAdmin } from "@/server/auth/admin-session";
import { verifyPassword } from "@/server/auth/password";
import { audit } from "@/server/services/audit.service";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }).strict(),
  z.object({ action: z.literal("enable"), code: z.string().regex(/^\d{6}$/) }).strict(),
  z.object({ action: z.literal("disable"), password: z.string().min(1).max(256) }).strict(),
]);

/** 2FA TOTP: setup → enable(código) · disable(contraseña). Secreto cifrado con AES-256-GCM. */
export const POST = route(async (req: NextRequest) => {
  const a = await requireAdmin(req);
  const body = await parseJson(req, schema);
  const pendingKey = `totp:pending:${a.adminId}`;

  if (body.action === "setup") {
    if (a.totpEnabled) throw Errors.conflict("TOTP_ALREADY_ENABLED", "La verificación en dos pasos ya está activa.");
    const secret = authenticator.generateSecret();
    await redis().set(pendingKey, encryptSecret(secret), "EX", 600);
    const uri = authenticator.keyuri(a.email, "Prepa Yucatán Talleres", secret);
    return json({ secret, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
  }
  if (body.action === "enable") {
    const pending = await redis().get(pendingKey);
    if (!pending) throw Errors.badRequest("Inicia la configuración de nuevo.");
    const secret = decryptSecret(pending);
    if (!authenticator.verify({ token: body.code, secret })) throw Errors.badRequest("Código incorrecto.");
    await db().admin.update({ where: { id: a.adminId }, data: { totpSecret: encryptSecret(secret), totpEnabled: true } });
    await redis().del(pendingKey);
    await audit({ action: "TOTP_ENABLED", adminId: a.adminId, ipHash: a.ipHash });
    return json({ ok: true });
  }
  const admin = await db().admin.findUniqueOrThrow({ where: { id: a.adminId } });
  if (!(await verifyPassword(admin.passwordHash, body.password))) throw Errors.unauthorized("Contraseña incorrecta.");
  await db().admin.update({ where: { id: a.adminId }, data: { totpSecret: null, totpEnabled: false } });
  await audit({ action: "TOTP_DISABLED", adminId: a.adminId, ipHash: a.ipHash });
  return json({ ok: true });
});
