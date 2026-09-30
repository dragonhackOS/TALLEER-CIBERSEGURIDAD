import type { NextRequest } from "next/server";
import { Errors } from "@/lib/errors";
import { json, route, type RouteContext } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { uuid } from "@/schemas";
import { requireStudent } from "@/server/auth/student-session";
import { cancelRegistration } from "@/server/services/registration.service";

export const runtime = "nodejs";

/** POST /api/me/registrations/:id/cancel — el alumno cancela SU inscripción. */
export const POST = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  const { ipHash } = await publicRateLimit(req);
  const s = await requireStudent(req);
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  const r = await cancelRegistration({ registrationId: id, by: { type: "STUDENT", studentId: s.studentId }, reason: "Cancelada por el alumno", ipHash });
  return json({ ok: true, promoted: r.promoted });
});
