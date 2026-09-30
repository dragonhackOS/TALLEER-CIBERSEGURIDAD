import type { NextRequest } from "next/server";
import { Errors } from "@/lib/errors";
import { json, route, type RouteContext } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { uuid } from "@/schemas";
import { requireStudent } from "@/server/auth/student-session";
import { leaveWaitlist } from "@/server/services/waitlist.service";

export const runtime = "nodejs";

/** DELETE /api/me/waitlist/:id — salir de la lista de espera. */
export const DELETE = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  await publicRateLimit(req);
  const s = await requireStudent(req);
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  await leaveWaitlist({ entryId: id, by: { type: "STUDENT", studentId: s.studentId } });
  return json({ ok: true });
});
