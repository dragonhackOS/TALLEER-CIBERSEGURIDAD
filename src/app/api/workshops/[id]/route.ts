import type { NextRequest } from "next/server";
import { Errors } from "@/lib/errors";
import { json, route, type RouteContext } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { getPublicWorkshop } from "@/server/services/workshop.service";

export const runtime = "nodejs";

/** GET /api/workshops/:id — acepta id o slug. */
export const GET = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  await publicRateLimit(req);
  const { id } = await ctx.params;
  if (!/^[a-z0-9-]{1,80}$/i.test(id)) throw Errors.notFound();
  const w = await getPublicWorkshop(id);
  if (!w) throw Errors.notFound("El taller no existe.");
  return json({ workshop: w });
});
