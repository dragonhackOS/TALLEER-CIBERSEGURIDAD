import type { NextRequest } from "next/server";
import { json, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { requireStudent } from "@/server/auth/student-session";

export const runtime = "nodejs";

/** POST /api/session/keepalive — "CONTINUAR SESIÓN": renueva el tiempo de inactividad. */
export const POST = route(async (req: NextRequest) => {
  await publicRateLimit(req);
  const s = await requireStudent(req, { touch: true });
  return json({ ok: true, expiresAt: s.expiresAt.toISOString(), serverTime: new Date().toISOString() });
});
