import type { NextRequest } from "next/server";
import { Errors } from "@/lib/errors";
import { json, route, type RouteContext } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { getPublicRegistration } from "@/server/services/registration.service";

export const runtime = "nodejs";

/** GET /api/registration/:publicId — comprobante (sin correo ni teléfono). */
export const GET = route(async (req: NextRequest, ctx: RouteContext<{ publicId: string }>) => {
  await publicRateLimit(req);
  const { publicId } = await ctx.params;
  if (!/^reg_[0-9a-z]{26}$/.test(publicId)) throw Errors.notFound();
  const reg = await getPublicRegistration(publicId);
  if (!reg) throw Errors.notFound("Inscripción no encontrada.");
  const { qrVersion: _v, ...safe } = reg;
  return json({ registration: safe });
});
