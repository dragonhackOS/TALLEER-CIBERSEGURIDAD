import type { NextRequest } from "next/server";
import { json, parseJson, route } from "@/server/http/handler";
import { createWorkshopSchema } from "@/schemas";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { isScopedToAssignedWorkshops } from "@/server/auth/rbac";
import { createWorkshop, listAdminWorkshops } from "@/server/services/workshop.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "workshops:read");
  const scope = isScopedToAssignedWorkshops(a.role) ? await instructorWorkshopIds(a.adminId) : undefined;
  return json({ workshops: await listAdminWorkshops(scope) });
});

export const POST = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "workshops:write");
  const body = await parseJson(req, createWorkshopSchema);
  const w = await createWorkshop(body, a.adminId, a.ipHash);
  return json({ workshop: { id: w.id, slug: w.slug } }, 201);
});
