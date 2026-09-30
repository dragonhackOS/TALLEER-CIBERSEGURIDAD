import type { NextRequest } from "next/server";
import { json, route } from "@/server/http/handler";
import { clearAdminCookie, getAdmin, revokeAdminSession } from "@/server/auth/admin-session";
import { audit } from "@/server/services/audit.service";

export const runtime = "nodejs";

export const POST = route(async (req: NextRequest) => {
  const admin = await getAdmin(req);
  if (admin) {
    await revokeAdminSession(admin.sessionId);
    await audit({ action: "LOGOUT", adminId: admin.adminId, ipHash: admin.ipHash });
  }
  const res = json({ ok: true });
  clearAdminCookie(res);
  return res;
});
