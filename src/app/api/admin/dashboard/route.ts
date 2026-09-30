import type { NextRequest } from "next/server";
import { json, route } from "@/server/http/handler";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { isScopedToAssignedWorkshops } from "@/server/auth/rbac";
import { getDashboard } from "@/server/services/dashboard.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "dashboard:read");
  const scope = isScopedToAssignedWorkshops(a.role) ? await instructorWorkshopIds(a.adminId) : undefined;
  return json(await getDashboard(scope));
});
