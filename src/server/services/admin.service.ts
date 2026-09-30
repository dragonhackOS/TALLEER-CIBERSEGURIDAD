import { db, isUniqueViolation } from "@/lib/db";
import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { hashPassword, passwordStrengthError } from "@/server/auth/password";
import { revokeAllAdminSessions } from "@/server/auth/admin-session";
import { audit } from "./audit.service";
import type { AdminRole } from "@/generated/prisma/enums";

export async function listAdmins() {
  const admins = await db().admin.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      totpEnabled: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
    },
  });
  return admins.map(({ _count, ...a }) => ({ ...a, activeSessions: _count.sessions }));
}

export async function createAdmin(
  input: { email: string; name: string; role: AdminRole; password: string },
  actor: { adminId: string | null; ipHash: string | null },
) {
  const weak = passwordStrengthError(input.password);
  if (weak) throw Errors.unprocessable("WEAK_PASSWORD", weak);
  try {
    const admin = await db().admin.create({
      data: { email: input.email, name: input.name, role: input.role, passwordHash: await hashPassword(input.password) },
      select: { id: true, email: true, name: true, role: true },
    });
    await audit({
      action: "ADMIN_CREATED",
      adminId: actor.adminId,
      actorType: actor.adminId ? "ADMIN" : "SYSTEM",
      resourceType: "admin",
      resourceId: admin.id,
      metadata: { email: admin.email, role: admin.role },
      ipHash: actor.ipHash,
    });
    return admin;
  } catch (err) {
    if (isUniqueViolation(err)) throw Errors.conflict("EMAIL_TAKEN", "Ya existe un administrador con ese correo.");
    throw err;
  }
}

export async function updateAdmin(
  id: string,
  input: { role?: AdminRole; active?: boolean; revokeSessions?: boolean; password?: string },
  actor: { adminId: string; ipHash: string | null },
) {
  const target = await db().admin.findUnique({ where: { id } });
  if (!target) throw Errors.notFound();
  if (id === actor.adminId && (input.role && input.role !== target.role || input.active === false)) {
    throw Errors.unprocessable("SELF_LOCKOUT", "No puedes cambiar tu propio rol ni desactivar tu cuenta.");
  }
  // Nunca dejar el sistema sin SUPER_ADMIN activo.
  if (target.role === "SUPER_ADMIN" && ((input.role && input.role !== "SUPER_ADMIN") || input.active === false)) {
    const others = await db().admin.count({ where: { role: "SUPER_ADMIN", active: true, NOT: { id } } });
    if (others === 0) throw Errors.unprocessable("LAST_SUPER_ADMIN", "Debe existir al menos un super administrador activo.");
  }
  const data: Record<string, unknown> = {};
  if (input.role) data.role = input.role;
  if (input.active !== undefined) data.active = input.active;
  if (input.password) {
    const weak = passwordStrengthError(input.password);
    if (weak) throw Errors.unprocessable("WEAK_PASSWORD", weak);
    data.passwordHash = await hashPassword(input.password);
  }
  if (Object.keys(data).length) await db().admin.update({ where: { id }, data });
  if (input.revokeSessions || input.active === false || input.password || input.role) await revokeAllAdminSessions(id);
  await audit({
    action: input.revokeSessions && Object.keys(data).length === 0 ? "SESSIONS_REVOKED" : "ADMIN_UPDATED",
    adminId: actor.adminId,
    resourceType: "admin",
    resourceId: id,
    metadata: { role: input.role, active: input.active, passwordReset: !!input.password, revokeSessions: !!input.revokeSessions },
    ipHash: actor.ipHash,
  });
}

/* --------------------- Configuración de marca --------------------- */

export interface Branding {
  schoolName: string;
  logoUrl: string;
}

export async function getBranding(): Promise<Branding> {
  const e = env();
  try {
    const row = await db().setting.findUnique({ where: { key: "branding" } });
    const v = (row?.value ?? {}) as Partial<Branding>;
    return { schoolName: v.schoolName || e.SCHOOL_NAME, logoUrl: v.logoUrl || e.LOGO_URL };
  } catch {
    return { schoolName: e.SCHOOL_NAME, logoUrl: e.LOGO_URL };
  }
}

export async function updateBranding(input: Partial<Branding>, actor: { adminId: string; ipHash: string | null }) {
  const current = await getBranding();
  const value = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
  await db().setting.upsert({ where: { key: "branding" }, update: { value }, create: { key: "branding", value } });
  await audit({ action: "SETTINGS_UPDATED", adminId: actor.adminId, resourceType: "settings", resourceId: "branding", metadata: value, ipHash: actor.ipHash });
  return value;
}
