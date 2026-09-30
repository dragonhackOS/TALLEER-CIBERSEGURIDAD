import type { z } from "zod";
import { db, Prisma } from "@/lib/db";
import { env } from "@/lib/env";
import type { listRegistrationsQuery } from "@/schemas";

type Query = z.infer<typeof listRegistrationsQuery>;

/** Construye el filtro Prisma (parametrizado: sin SQL dinámico). */
export function registrationWhere(q: Partial<Query>, scopeIds?: string[]): Prisma.RegistrationWhereInput {
  const and: Prisma.RegistrationWhereInput[] = [];
  if (scopeIds) and.push({ workshopId: { in: scopeIds } });
  if (q.workshopId) and.push({ workshopId: q.workshopId });
  if (q.status === "ACTIVE") and.push({ status: { in: ["REGISTERED", "CHECKED_IN", "NO_SHOW"] } });
  else if (q.status) and.push({ status: q.status });
  if (q.semester) and.push({ student: { semester: q.semester } });
  if (q.attendance === "yes") and.push({ status: "CHECKED_IN" });
  if (q.attendance === "no") and.push({ status: { in: ["REGISTERED", "NO_SHOW"] } });
  if (q.date) {
    // Día local (America/Merida, UTC-6 sin horario de verano).
    const start = new Date(`${q.date}T00:00:00-06:00`);
    const end = new Date(start.getTime() + 86400_000);
    and.push({ createdAt: { gte: start, lt: end } });
  }
  if (q.q) {
    const term = q.q;
    and.push({
      OR: [
        { student: { fullName: { contains: term, mode: "insensitive" } } },
        { student: { email: { contains: term, mode: "insensitive" } } },
        { student: { classroom: { contains: term, mode: "insensitive" } } },
        { registrationCode: { contains: term.toUpperCase() } },
        { workshop: { name: { contains: term, mode: "insensitive" } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

export async function listRegistrations(q: Query, scopeIds?: string[]) {
  const where = registrationWhere(q, scopeIds);
  const orderBy: Prisma.RegistrationOrderByWithRelationInput =
    q.sort === "name"
      ? { student: { fullName: q.dir } }
      : q.sort === "workshop"
        ? { workshop: { name: q.dir } }
        : q.sort === "code"
          ? { registrationCode: q.dir }
          : { createdAt: q.dir };
  const [total, rows] = await Promise.all([
    db().registration.count({ where }),
    db().registration.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        student: { select: { id: true, fullName: true, email: true, classroom: true, semester: true } },
        workshop: { select: { id: true, name: true, slug: true } },
        attendance: { select: { checkedInAt: true, method: true } },
      },
    }),
  ]);
  return {
    total,
    page: q.page,
    pageSize: q.pageSize,
    pages: Math.max(1, Math.ceil(total / q.pageSize)),
    timezone: env().TIMEZONE,
    items: rows.map((r) => ({
      id: r.id,
      code: r.registrationCode,
      status: r.status,
      createdAt: r.createdAt,
      source: r.source,
      student: r.student,
      workshop: r.workshop,
      checkedInAt: r.attendance?.checkedInAt ?? null,
    })),
  };
}

export async function getRegistrationDetail(id: string) {
  const reg = await db().registration.findUnique({
    where: { id },
    include: {
      student: true,
      workshop: true,
      attendance: { include: { checkedInBy: { select: { name: true, email: true } } } },
    },
  });
  if (!reg) return null;
  const [history, emails] = await Promise.all([
    db().auditLog.findMany({
      where: { resourceType: "registration", resourceId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { admin: { select: { name: true, email: true } } },
    }),
    db().emailLog.findMany({
      where: { relatedType: "registration", relatedId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, template: true, status: true, createdAt: true, sentAt: true, attempts: true, toAddresses: true },
    }),
  ]);
  return { reg, history, emails };
}
