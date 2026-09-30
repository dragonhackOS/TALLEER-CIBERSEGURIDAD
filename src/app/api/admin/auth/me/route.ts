import type { NextRequest } from "next/server";
import { json, route } from "@/server/http/handler";
import { requireAdmin } from "@/server/auth/admin-session";
import { permissionsFor } from "@/server/auth/rbac";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  const a = await requireAdmin(req);
  return json({ id: a.adminId, email: a.email, name: a.name, role: a.role, totpEnabled: a.totpEnabled, permissions: permissionsFor(a.role) });
});
