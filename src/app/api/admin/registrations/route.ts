import type { NextRequest } from "next/server";
import { json, parseQuery, route } from "@/server/http/handler";
import { listRegistrationsQuery } from "@/schemas";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { isScopedToAssignedWorkshops } from "@/server/auth/rbac";
import { listRegistrations } from "@/server/services/registration-query.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "registrations:read");
  const q = parseQuery(req, listRegistrationsQuery);
  const scope = isScopedToAssignedWorkshops(a.role) ? await instructorWorkshopIds(a.adminId) : undefined;
  return json(await listRegistrations(q, scope));
});
