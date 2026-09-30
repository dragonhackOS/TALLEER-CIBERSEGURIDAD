import type { NextRequest } from "next/server";
import { Errors } from "@/lib/errors";
import { json, route, type RouteContext } from "@/server/http/handler";
import { uuid } from "@/schemas";
import { requireAdmin } from "@/server/auth/admin-session";
import { leaveWaitlist } from "@/server/services/waitlist.service";

export const runtime = "nodejs";

export const DELETE = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  const a = await requireAdmin(req, "waitlist:write");
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  await leaveWaitlist({ entryId: id, by: { type: "ADMIN", adminId: a.adminId } });
  return json({ ok: true });
});
