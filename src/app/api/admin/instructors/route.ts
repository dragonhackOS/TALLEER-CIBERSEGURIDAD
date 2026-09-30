import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, route } from "@/server/http/handler";
import { requireAdmin } from "@/server/auth/admin-session";

export const runtime = "nodejs";

/** Instructores disponibles para asignar a talleres. */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req, "workshops:write");
  const rows = await db().admin.findMany({ where: { role: "INSTRUCTOR", active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
  return json({ instructors: rows });
});
