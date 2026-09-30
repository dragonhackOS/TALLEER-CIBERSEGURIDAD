import { db, Prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { listAdminWorkshops } from "./workshop.service";

/** Métricas del dashboard. Todas las cifras provienen de la base de datos. */
export async function getDashboard(scopeIds?: string[]) {
  const tz = env().TIMEZONE;
  const scope = scopeIds ? Prisma.sql`AND r.workshop_id = ANY(${scopeIds}::uuid[])` : Prisma.empty;
  const workshops = (await listAdminWorkshops(scopeIds)).filter((w) => !w.archived && w.status !== "CANCELLED" && w.status !== "DRAFT");

  const [todayRow] = await db().$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM registrations r
     WHERE r.status IN ('REGISTERED','CHECKED_IN','NO_SHOW')
       AND (r.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = (now() AT TIME ZONE ${tz})::date ${scope}`;

  const byDay = await db().$queryRaw<{ day: string; n: number }[]>`
    SELECT to_char((r.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day, count(*)::int AS n
      FROM registrations r
     WHERE r.created_at > timezone('utc', now()) - interval '30 days' ${scope}
     GROUP BY 1 ORDER BY 1`;

  const byHour = await db().$queryRaw<{ hour: number; n: number }[]>`
    SELECT extract(hour FROM (r.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${tz}))::int AS hour, count(*)::int AS n
      FROM registrations r
     WHERE r.status <> 'CANCELLED' ${scope}
     GROUP BY 1 ORDER BY 1`;

  const bySemester = await db().$queryRaw<{ semester: number | null; n: number }[]>`
    SELECT s.semester, count(*)::int AS n
      FROM registrations r JOIN students s ON s.id = r.student_id
     WHERE r.status IN ('REGISTERED','CHECKED_IN','NO_SHOW') ${scope}
     GROUP BY 1 ORDER BY 1`;

  const recent = await db().registration.findMany({
    where: { status: { in: ["REGISTERED", "CHECKED_IN", "NO_SHOW"] }, ...(scopeIds ? { workshopId: { in: scopeIds } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, createdAt: true, registrationCode: true, source: true, student: { select: { fullName: true } }, workshop: { select: { name: true } } },
  });

  const totalRegistered = workshops.reduce((a, w) => a + w.registered, 0);
  const totalCapacity = workshops.reduce((a, w) => a + w.maxCapacity, 0);
  const openStates = new Set(["DISPONIBLE", "POCOS_LUGARES"]);

  // Serie diaria continua (últimos 14 días).
  const dayMap = new Map(byDay.map((d) => [d.day, Number(d.n)]));
  const days: { day: string; n: number }[] = [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  for (let i = 13; i >= 0; i--) {
    const key = fmt.format(new Date(Date.now() - i * 86400_000));
    days.push({ day: key, n: dayMap.get(key) ?? 0 });
  }
  const hourMap = new Map(byHour.map((h) => [Number(h.hour), Number(h.n)]));

  return {
    cards: {
      totalRegistered,
      totalCapacity,
      available: Math.max(0, totalCapacity - totalRegistered),
      occupancy: totalCapacity ? Math.round((totalRegistered / totalCapacity) * 100) : 0,
      openWorkshops: workshops.filter((w) => w.status === "OPEN" && openStates.has(w.publicStatus)).length,
      fullWorkshops: workshops.filter((w) => w.registered >= w.maxCapacity).length,
      registrationsToday: Number(todayRow?.n ?? 0),
      checkins: workshops.reduce((a, w) => a + w.checkins, 0),
      waitlist: workshops.reduce((a, w) => a + w.waitlist, 0),
    },
    workshops: workshops.map((w) => ({
      id: w.id,
      name: w.name,
      registered: w.registered,
      capacity: w.maxCapacity,
      available: w.available,
      held: w.held,
      waitlist: w.waitlist,
      checkins: w.checkins,
      publicStatus: w.publicStatus,
      status: w.status,
      occupancy: w.maxCapacity ? Math.round((w.registered / w.maxCapacity) * 100) : 0,
    })),
    charts: {
      byDay: days,
      byHour: Array.from({ length: 24 }, (_, h) => ({ hour: h, n: hourMap.get(h) ?? 0 })),
      bySemester: bySemester.map((s) => ({ semester: s.semester ? `${s.semester}°` : "N/D", n: Number(s.n) })),
    },
    nearlyFull: workshops
      .filter((w) => w.registered < w.maxCapacity && w.registered / w.maxCapacity >= 0.7)
      .sort((a, b) => b.registered / b.maxCapacity - a.registered / a.maxCapacity)
      .map((w) => ({ id: w.id, name: w.name, registered: w.registered, capacity: w.maxCapacity })),
    recent: recent.map((r) => ({
      id: r.id,
      at: r.createdAt,
      code: r.registrationCode,
      studentName: r.student.fullName,
      workshopName: r.workshop.name,
      source: r.source,
    })),
  };
}
