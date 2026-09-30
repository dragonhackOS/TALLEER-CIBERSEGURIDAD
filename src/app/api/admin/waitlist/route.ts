import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { json, parseQuery, route } from "@/server/http/handler";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { isScopedToAssignedWorkshops } from "@/server/auth/rbac";

export const runtime = "nodejs";

const q = z.object({ workshopId: z.string().uuid().optional() });

export const GET = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "waitlist:read");
  const p = parseQuery(req, q);
  const scope = isScopedToAssignedWorkshops(a.role) ? await instructorWorkshopIds(a.adminId) : undefined;
  const entries = await db().waitlistEntry.findMany({
    where: { status: "WAITING", ...(p.workshopId ? { workshopId: p.workshopId } : {}), ...(scope ? { workshopId: { in: scope } } : {}) },
    orderBy: [{ workshopId: "asc" }, { position: "asc" }],
    include: { student: { select: { fullName: true, email: true, classroom: true, semester: true } }, workshop: { select: { id: true, name: true } } },
  });
  const rankCounter = new Map<string, number>();
  return json({
    entries: entries.map((e) => {
      const n = (rankCounter.get(e.workshopId) ?? 0) + 1;
      rankCounter.set(e.workshopId, n);
      return { id: e.id, position: n, createdAt: e.createdAt, student: e.student, workshop: e.workshop };
    }),
  });
});
