import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { requireStudent } from "@/server/auth/student-session";

export const runtime = "nodejs";

/** GET /api/me — inscripciones y listas de espera del alumno autenticado. */
export const GET = route(async (req: NextRequest) => {
  await publicRateLimit(req);
  const s = await requireStudent(req);
  const [registrations, waitlist] = await Promise.all([
    db().registration.findMany({
      where: { studentId: s.studentId },
      orderBy: { createdAt: "desc" },
      include: { workshop: { select: { name: true, slug: true, date: true, startTime: true, endTime: true, location: true } }, attendance: { select: { checkedInAt: true } } },
    }),
    db().waitlistEntry.findMany({
      where: { studentId: s.studentId, status: "WAITING" },
      include: { workshop: { select: { id: true, name: true, slug: true } } },
    }),
  ]);
  const ranks = await Promise.all(
    waitlist.map((e) => db().waitlistEntry.count({ where: { workshopId: e.workshopId, status: "WAITING", position: { lt: e.position } } })),
  );
  return json({
    email: s.email,
    expiresAt: s.expiresAt.toISOString(),
    registrations: registrations.map((r) => ({
      id: r.id,
      publicId: r.publicId,
      code: r.registrationCode,
      status: r.status,
      createdAt: r.createdAt,
      checkedInAt: r.attendance?.checkedInAt ?? null,
      workshop: r.workshop,
    })),
    waitlist: waitlist.map((e, i) => ({ id: e.id, position: ranks[i] + 1, workshop: e.workshop, createdAt: e.createdAt })),
  });
});
