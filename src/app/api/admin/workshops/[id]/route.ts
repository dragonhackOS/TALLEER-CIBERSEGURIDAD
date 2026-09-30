import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { json, parseJson, route, type RouteContext } from "@/server/http/handler";
import { updateWorkshopSchema, uuid } from "@/schemas";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { isScopedToAssignedWorkshops } from "@/server/auth/rbac";
import { updateWorkshop } from "@/server/services/workshop.service";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  const a = await requireAdmin(req, "workshops:read");
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  if (isScopedToAssignedWorkshops(a.role) && !(await instructorWorkshopIds(a.adminId)).includes(id)) throw Errors.notFound();
  const w = await db().workshop.findUnique({ where: { id } });
  if (!w) throw Errors.notFound();
  return json({ workshop: { ...w, date: w.date.toISOString().slice(0, 10) } });
});

export const PATCH = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  const a = await requireAdmin(req, "workshops:write");
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  const body = await parseJson(req, updateWorkshopSchema);
  const w = await updateWorkshop(id, body, a.adminId, a.ipHash);
  return json({ workshop: { id: w.id } });
});
