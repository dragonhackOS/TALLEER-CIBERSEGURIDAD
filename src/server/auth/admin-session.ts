import type { NextRequest, NextResponse } from "next/server";
import { authenticator } from "otplib";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { decryptSecret, hashIp, randomToken, sha256 } from "@/lib/crypto";
import { Errors } from "@/lib/errors";
import { redis } from "@/lib/redis";
import { cookieName, sessionCookieOptions } from "@/server/http/cookies";
import { can, type Permission } from "./rbac";
import { dummyVerify, verifyPassword } from "./password";
import { audit } from "@/server/services/audit.service";
import type { AdminRole } from "@/generated/prisma/enums";

export interface AdminContext {
  sessionId: string;
  adminId: string;
  email: string;
  name: string;
  role: AdminRole;
  ipHash: string | null;
  totpEnabled: boolean;
}

const MAX_FAILED = 10;
const LOCK_MINUTES = 15;

/**
 * Login administrativo. Siempre emite un token NUEVO (protección contra
 * session fixation); cualquier cookie previa se ignora y se reemplaza.
 */
export async function loginAdmin(input: {
  email: string;
  password: string;
  totp?: string;
  ip: string;
  userAgent: string | null;
}): Promise<{ token: string; expiresAt: Date; admin: { id: string; name: string; role: AdminRole } } | { totpRequired: true }> {
  const ipHash = hashIp(input.ip);
  const admin = await db().admin.findUnique({ where: { email: input.email } });
  const genericError = Errors.unauthorized("Correo o contraseña incorrectos.");

  if (!admin || !admin.active) {
    await dummyVerify(input.password);
    await audit({ action: "LOGIN_FAILED", actorType: "SYSTEM", metadata: { reason: "unknown_or_inactive" }, ipHash });
    throw genericError;
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    await dummyVerify(input.password);
    throw Errors.rateLimited((admin.lockedUntil.getTime() - Date.now()) / 1000);
  }

  const ok = await verifyPassword(admin.passwordHash, input.password);
  if (!ok) {
    const failed = admin.failedLogins + 1;
    await db().admin.update({
      where: { id: admin.id },
      data: {
        failedLogins: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : admin.lockedUntil,
      },
    });
    await audit({ action: "LOGIN_FAILED", adminId: admin.id, metadata: { reason: "bad_password" }, ipHash });
    throw genericError;
  }

  if (admin.totpEnabled && admin.totpSecret) {
    if (!input.totp) return { totpRequired: true };
    const secret = decryptSecret(admin.totpSecret);
    const valid = authenticator.verify({ token: input.totp, secret });
    // Anti-replay: cada código TOTP se acepta una sola vez.
    const fresh = valid ? await redis().set(`totp:used:${admin.id}:${input.totp}`, "1", "EX", 120, "NX") : null;
    if (!valid || fresh !== "OK") {
      await audit({ action: "LOGIN_FAILED", adminId: admin.id, metadata: { reason: "bad_totp" }, ipHash });
      throw Errors.unauthorized("Código de verificación incorrecto.");
    }
  }

  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env().ADMIN_SESSION_HOURS * 3600_000);
  await db().$transaction([
    db().adminSession.create({
      data: {
        tokenHash: sha256(token),
        adminId: admin.id,
        ipHash,
        userAgent: input.userAgent?.slice(0, 255) ?? null,
        expiresAt,
      },
    }),
    db().admin.update({
      where: { id: admin.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() },
    }),
  ]);
  await audit({ action: "LOGIN", adminId: admin.id, ipHash });
  return { token, expiresAt, admin: { id: admin.id, name: admin.name, role: admin.role } };
}

export function setAdminCookie(res: NextResponse, token: string) {
  res.cookies.set(cookieName("adm"), token, sessionCookieOptions(env().ADMIN_SESSION_HOURS * 3600));
}

export function clearAdminCookie(res: NextResponse) {
  res.cookies.set(cookieName("adm"), "", { ...sessionCookieOptions(0), maxAge: 0 });
}

/** Valida la sesión con caducidad absoluta + por inactividad. */
export async function getAdminFromToken(token: string | undefined, ip?: string): Promise<AdminContext | null> {
  if (!token || token.length > 100) return null;
  const session = await db().adminSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { admin: true },
  });
  if (!session || session.revokedAt || !session.admin.active) return null;
  const now = Date.now();
  const idleLimit = env().ADMIN_IDLE_MINUTES * 60_000;
  if (session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > idleLimit) {
    await db().adminSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return null;
  }
  // Actualiza "última actividad" como máximo una vez por minuto.
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await db().adminSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  }
  return {
    sessionId: session.id,
    adminId: session.admin.id,
    email: session.admin.email,
    name: session.admin.name,
    role: session.admin.role,
    ipHash: ip ? hashIp(ip) : session.ipHash,
    totpEnabled: session.admin.totpEnabled,
  };
}

export async function getAdmin(req: NextRequest): Promise<AdminContext | null> {
  const ip =
    (env().TRUST_PROXY ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() : undefined) ??
    req.headers.get("x-real-ip") ??
    undefined;
  return getAdminFromToken(req.cookies.get(cookieName("adm"))?.value, ip);
}

export async function requireAdmin(req: NextRequest, permission?: Permission): Promise<AdminContext> {
  const admin = await getAdmin(req);
  if (!admin) throw Errors.unauthorized();
  if (permission && !can(admin.role, permission)) throw Errors.forbidden();
  return admin;
}

export async function revokeAdminSession(sessionId: string) {
  await db().adminSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}

export async function revokeAllAdminSessions(adminId: string) {
  await db().adminSession.updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** IDs de talleres asignados a un instructor. */
export async function instructorWorkshopIds(adminId: string): Promise<string[]> {
  const rows = await db().workshop.findMany({ where: { instructorAdminId: adminId }, select: { id: true } });
  return rows.map((r) => r.id);
}
