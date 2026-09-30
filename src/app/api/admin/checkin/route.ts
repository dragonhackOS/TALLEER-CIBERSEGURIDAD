import type { NextRequest } from "next/server";
import { json, parseJson, route } from "@/server/http/handler";
import { checkinSchema } from "@/schemas";
import { requireAdmin } from "@/server/auth/admin-session";
import { checkIn } from "@/server/services/checkin.service";

export const runtime = "nodejs";

/** POST /api/admin/checkin — QR firmado, código o ID de inscripción. */
export const POST = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "checkin:write");
  const body = await parseJson(req, checkinSchema);
  const r = await checkIn(a, body);
  if (r.status === "ALREADY_CHECKED_IN") {
    return json({ error: "ALREADY_CHECKED_IN", message: "Este alumno ya realizó check-in.", details: { result: r } }, 409);
  }
  return json({ ok: true, result: r });
});
