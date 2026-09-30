import type { NextRequest } from "next/server";
import { Errors } from "@/lib/errors";
import { json, route, type RouteContext } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { uuid } from "@/schemas";
import { requireStudent } from "@/server/auth/student-session";
import { releaseReservation } from "@/server/services/reservation.service";

export const runtime = "nodejs";

/** DELETE /api/reservations/:id — libera la reserva (solo su dueño: previene IDOR). */
export const DELETE = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  await publicRateLimit(req);
  const student = await requireStudent(req, { touch: false });
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  const released = await releaseReservation(student.studentId, id);
  if (!released) throw Errors.notFound("Reserva no encontrada o ya vencida.");
  return json({ ok: true });
});
