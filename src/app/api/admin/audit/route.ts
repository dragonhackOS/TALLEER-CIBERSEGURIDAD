import type { NextRequest } from "next/server";
import { z } from "zod";
import { db, Prisma } from "@/lib/db";
import { json, parseQuery, route } from "@/server/http/handler";
import { requireAdmin } from "@/server/auth/admin-session";

export const runtime = "nodejs";

const q = z.object({
  action: z.string().regex(/^[A-Z_]{2,60}$/).optional(),
  resourceType: z.string().regex(/^[a-z_]{2,40}$/).optional(),
  resourceId: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(30),
});

/** GET /api/admin/audit — solo lectura (los registros no pueden eliminarse). */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req, "audit:read");
  const p = parseQuery(req, q);
  const where: Prisma.AuditLogWhereInput = {
    ...(p.action ? { action: p.action } : {}),
    ...(p.resourceType ? { resourceType: p.resourceType } : {}),
    ...(p.resourceId ? { resourceId: p.resourceId } : {}),
  };
  const [total, rows, actions] = await Promise.all([
    db().auditLog.count({ where }),
    db().auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: { admin: { select: { name: true, email: true } } },
    }),
    db().auditLog.groupBy({ by: ["action"], _count: { _all: true }, orderBy: { action: "asc" } }),
  ]);
  return json({
    total,
    page: p.page,
    pages: Math.max(1, Math.ceil(total / p.pageSize)),
    actions: actions.map((a) => a.action),
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorType: r.actorType,
      admin: r.admin,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      metadata: r.metadata,
      ipHash: r.ipHash,
      createdAt: r.createdAt,
    })),
  });
});
