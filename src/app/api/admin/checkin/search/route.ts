import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { json, parseQuery, route } from "@/server/http/handler";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { isScopedToAssignedWorkshops } from "@/server/auth/rbac";

export const runtime = "nodejs";

const q = z.object({ q: z.string().trim().min(2).max(100), workshopId: z.string().uuid().optional() });

/** Búsqueda manual para check-in (nombre, correo o código). Datos mínimos. */
export const GET = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "checkin:write");
  const p = parseQuery(req, q);
  const scope = isScopedToAssignedWorkshops(a.role) ? await instructorWorkshopIds(a.adminId) : undefined;
  const rows = await db().registration.findMany({
    where: {
      status: { in: ["REGISTERED", "CHECKED_IN", "NO_SHOW"] },
      ...(p.workshopId ? { workshopId: p.workshopId } : {}),
      ...(scope ? { workshopId: { in: scope } } : {}),
      OR: [
        { registrationCode: { contains: p.q.toUpperCase() } },
        { student: { fullName: { contains: p.q, mode: "insensitive" } } },
        { student: { email: { contains: p.q, mode: "insensitive" } } },
      ],
    },
    take: 15,
    orderBy: { createdAt: "asc" },
    include: { student: { select: { fullName: true, email: true, classroom: true, semester: true } }, workshop: { select: { name: true } }, attendance: { select: { checkedInAt: true } } },
  });
  return json({
    results: rows.map((r) => ({
      id: r.id,
      code: r.registrationCode,
      status: r.status,
      studentName: r.student.fullName,
      email: r.student.email,
      classroom: r.student.classroom,
      semester: r.student.semester,
      workshopName: r.workshop.name,
      checkedInAt: r.attendance?.checkedInAt ?? null,
    })),
  });
});
