import type { NextRequest } from "next/server";
import { Errors } from "@/lib/errors";
import { json, parseJson, route, type RouteContext } from "@/server/http/handler";
import { uuid, workshopActionSchema } from "@/schemas";
import { requireAdmin } from "@/server/auth/admin-session";
import { workshopAction } from "@/server/services/workshop.service";

export const runtime = "nodejs";

/** POST — abrir, cerrar, cancelar, archivar, finalizar o duplicar un taller. */
export const POST = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  const a = await requireAdmin(req, "workshops:write");
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  const { action } = await parseJson(req, workshopActionSchema);
  return json(await workshopAction(id, action, a.adminId, a.ipHash));
});
