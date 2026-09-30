import type { NextRequest } from "next/server";
import { json, parseJson, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { joinWaitlistSchema } from "@/schemas";
import { requireStudent } from "@/server/auth/student-session";
import { checkRateLimit, RULES } from "@/server/rate-limit";
import { checkHoneypot } from "@/server/services/antibot";
import { joinWaitlist } from "@/server/services/waitlist.service";

export const runtime = "nodejs";

/** POST /api/waitlist — UNIRME A LISTA DE ESPERA (solo si el taller está lleno). */
export const POST = route(async (req: NextRequest) => {
  const { ip, ipHash } = await publicRateLimit(req);
  const s = await requireStudent(req);
  await checkRateLimit(RULES.formIp, ip);
  const body = await parseJson(req, joinWaitlistSchema);
  await checkHoneypot(body.website_url, ip);
  const r = await joinWaitlist({ studentId: s.studentId, workshopId: body.workshopId, profile: body.profile, ipHash });
  return json({ ok: true, position: r.position, entryId: r.entryId }, 201);
});
