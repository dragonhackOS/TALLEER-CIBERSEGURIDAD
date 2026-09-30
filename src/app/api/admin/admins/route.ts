import type { NextRequest } from "next/server";
import { json, parseJson, route } from "@/server/http/handler";
import { createAdminSchema } from "@/schemas";
import { requireAdmin } from "@/server/auth/admin-session";
import { createAdmin, listAdmins } from "@/server/services/admin.service";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requireAdmin(req, "admins:manage");
  return json({ admins: await listAdmins() });
});

export const POST = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "admins:manage");
  const body = await parseJson(req, createAdminSchema);
  const admin = await createAdmin(body, { adminId: a.adminId, ipHash: a.ipHash });
  return json({ admin }, 201);
});
