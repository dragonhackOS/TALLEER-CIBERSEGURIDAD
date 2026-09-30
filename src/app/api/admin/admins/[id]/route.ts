import type { NextRequest } from "next/server";
import { Errors } from "@/lib/errors";
import { json, parseJson, route, type RouteContext } from "@/server/http/handler";
import { updateAdminSchema, uuid } from "@/schemas";
import { requireAdmin } from "@/server/auth/admin-session";
import { updateAdmin } from "@/server/services/admin.service";

export const runtime = "nodejs";

export const PATCH = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  const a = await requireAdmin(req, "admins:manage");
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  const body = await parseJson(req, updateAdminSchema);
  await updateAdmin(id, body, { adminId: a.adminId, ipHash: a.ipHash });
  return json({ ok: true });
});
