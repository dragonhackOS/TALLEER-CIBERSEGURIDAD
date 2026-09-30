import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { json, parseJson, route } from "@/server/http/handler";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { isScopedToAssignedWorkshops } from "@/server/auth/rbac";
import { audit } from "@/server/services/audit.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resumen de asistencia por taller. */
export const GET = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "attendance:read");
  const scope = isScopedToAssignedWorkshops(a.role) ? await instructorWorkshopIds(a.adminId) : undefined;
  const workshops = await db().workshop.findMany({
    where: { archivedAt: null, status: { not: "DRAFT" }, ...(scope ? { id: { in: scope } } : {}) },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: { id: true, name: true, date: true, startTime: true, endTime: true, location: true, registeredCount: true, maxCapacity: true },
  });
  const grouped = await db().registration.groupBy({ by: ["workshopId", "status"], _count: { _all: true }, where: { workshopId: { in: workshops.map((w) => w.id) } } });
  const recent = await db().attendance.findMany({
    where: scope ? { registration: { workshopId: { in: scope } } } : {},
    orderBy: { checkedInAt: "desc" },
    take: 20,
    include: { registration: { select: { id: true, registrationCode: true, student: { select: { fullName: true } }, workshop: { select: { name: true } } } }, checkedInBy: { select: { name: true } } },
  });
  return json({
    workshops: workshops.map((w) => {
      const c = (s: string) => grouped.find((g) => g.workshopId === w.id && g.status === s)?._count._all ?? 0;
      return { ...w, date: w.date.toISOString().slice(0, 10), registered: c("REGISTERED"), checkedIn: c("CHECKED_IN"), noShow: c("NO_SHOW") };
    }),
    recent: recent.map((r) => ({
      id: r.id,
      at: r.checkedInAt,
      method: r.method,
      by: r.checkedInBy?.name ?? null,
      registrationId: r.registration.id,
      code: r.registration.registrationCode,
      studentName: r.registration.student.fullName,
      workshopName: r.registration.workshop.name,
    })),
  });
});

const body = z.object({ workshopId: z.string().uuid() }).strict();

/** POST — marca como NO_SHOW a todos los inscritos sin asistencia de un taller. */
export const POST = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "registrations:write");
  const { workshopId } = await parseJson(req, body);
  const w = await db().workshop.findUnique({ where: { id: workshopId } });
  if (!w) throw Errors.notFound();
  const res = await db().registration.updateMany({ where: { workshopId, status: "REGISTERED" }, data: { status: "NO_SHOW" } });
  await audit({ action: "NO_SHOW_MARKED", adminId: a.adminId, resourceType: "workshop", resourceId: workshopId, metadata: { count: res.count, bulk: true }, ipHash: a.ipHash });
  return json({ ok: true, count: res.count });
});
