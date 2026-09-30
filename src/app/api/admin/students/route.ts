import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, Prisma } from "@/lib/db";
import { json, parseQuery, route } from "@/server/http/handler";
import { requireAdmin } from "@/server/auth/admin-session";

export const runtime = "nodejs";

const q = z.object({
  q: z.string().trim().max(100).optional(),
  semester: z.coerce.number().int().min(1).max(6).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req, "students:read");
  const p = parseQuery(req, q);
  const where: Prisma.StudentWhereInput = {
    fullName: { not: null },
    ...(p.semester ? { semester: p.semester } : {}),
    ...(p.q
      ? { OR: [{ fullName: { contains: p.q, mode: "insensitive" } }, { email: { contains: p.q, mode: "insensitive" } }, { classroom: { contains: p.q, mode: "insensitive" } }] }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db().student.count({ where }),
    db().student.findMany({
      where,
      orderBy: { fullName: "asc" },
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: {
        registrations: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, registrationCode: true, workshop: { select: { name: true } } } },
        waitlist: { where: { status: "WAITING" }, select: { id: true, workshop: { select: { name: true } } } },
      },
    }),
  ]);
  return json({
    total,
    page: p.page,
    pages: Math.max(1, Math.ceil(total / p.pageSize)),
    items: rows.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      email: s.email,
      classroom: s.classroom,
      semester: s.semester,
      phone: s.phone,
      programmingExperience: s.programmingExperience,
      securityExperience: s.securityExperience,
      ctfBefore: s.ctfBefore,
      createdAt: s.createdAt,
      registrations: s.registrations,
      waitlist: s.waitlist,
    })),
  });
});
