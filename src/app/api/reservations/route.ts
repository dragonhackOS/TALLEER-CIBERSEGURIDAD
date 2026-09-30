import type { NextRequest } from "next/server";
import { json, parseJson, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { createReservationSchema } from "@/schemas";
import { requireStudent } from "@/server/auth/student-session";
import { checkRateLimit, RULES } from "@/server/rate-limit";
import { createReservation } from "@/server/services/reservation.service";

export const runtime = "nodejs";

/** POST /api/reservations — reserva temporal de lugar (RESERVATION_TIMEOUT_MINUTES). */
export const POST = route(async (req: NextRequest) => {
  await publicRateLimit(req);
  const student = await requireStudent(req);
  await checkRateLimit(RULES.reservationStudent, student.studentId);
  const body = await parseJson(req, createReservationSchema);
  const r = await createReservation(student.studentId, body.workshopId);
  return json(
    {
      reservationId: r.reservationId,
      workshopId: r.workshopId,
      expiresAt: r.expiresAt.toISOString(),
      serverTime: new Date().toISOString(),
      reused: r.reused,
    },
    r.reused ? 200 : 201,
  );
});
