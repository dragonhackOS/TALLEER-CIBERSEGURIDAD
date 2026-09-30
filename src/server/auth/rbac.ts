import type { AdminRole } from "@/generated/prisma/enums";

/**
 * Control de acceso basado en roles. La verificación ocurre SIEMPRE en el
 * backend; ocultar botones en el frontend es solo una conveniencia visual.
 */
export type Permission =
  | "dashboard:read"
  | "workshops:read"
  | "workshops:write"
  | "registrations:read"
  | "registrations:write"
  | "students:read"
  | "waitlist:read"
  | "waitlist:write"
  | "checkin:write"
  | "attendance:read"
  | "exports:create"
  | "audit:read"
  | "admins:manage"
  | "settings:manage";

const ALL: Permission[] = [
  "dashboard:read",
  "workshops:read",
  "workshops:write",
  "registrations:read",
  "registrations:write",
  "students:read",
  "waitlist:read",
  "waitlist:write",
  "checkin:write",
  "attendance:read",
  "exports:create",
  "audit:read",
  "admins:manage",
  "settings:manage",
];

export const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set(ALL),
  ADMIN: new Set<Permission>([
    "dashboard:read",
    "workshops:read",
    "workshops:write",
    "registrations:read",
    "registrations:write",
    "students:read",
    "waitlist:read",
    "waitlist:write",
    "checkin:write",
    "attendance:read",
    "exports:create",
    "audit:read",
  ]),
  INSTRUCTOR: new Set<Permission>([
    "dashboard:read",
    "workshops:read",
    "registrations:read",
    "attendance:read",
    "checkin:write",
    "waitlist:read",
  ]),
  CHECKIN_STAFF: new Set<Permission>(["checkin:write", "attendance:read"]),
  VIEWER: new Set<Permission>([
    "dashboard:read",
    "workshops:read",
    "registrations:read",
    "students:read",
    "waitlist:read",
    "attendance:read",
  ]),
};

export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/** Los instructores solo ven talleres que tienen asignados. */
export function isScopedToAssignedWorkshops(role: AdminRole): boolean {
  return role === "INSTRUCTOR";
}

export function permissionsFor(role: AdminRole): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}
