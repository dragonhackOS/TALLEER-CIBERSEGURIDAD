import type { NextRequest } from "next/server";
import { Errors } from "@/lib/errors";
import { json, parseJson, route, type RouteContext } from "@/server/http/handler";
import { capacitySchema, uuid } from "@/schemas";
import { requireAdmin } from "@/server/auth/admin-session";
import { changeCapacity } from "@/server/services/workshop.service";

export const runtime = "nodejs";

/** PUT — cambio de capacidad (bloqueo de fila; nunca por debajo de los inscritos). */
export const PUT = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  const a = await requireAdmin(req, "workshops:write");
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  const { maxCapacity } = await parseJson(req, capacitySchema);
  return json(await changeCapacity(id, maxCapacity, a.adminId, a.ipHash));
});
