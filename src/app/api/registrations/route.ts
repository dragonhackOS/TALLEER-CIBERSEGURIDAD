import type { NextRequest } from "next/server";
import { canonicalHash } from "@/lib/crypto";
import { isAppError, type AppError } from "@/lib/errors";
import { db } from "@/lib/db";
import { errorResponse, json, parseJson, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { createRegistrationSchema } from "@/schemas";
import { requireStudent } from "@/server/auth/student-session";
import { checkRateLimit, RULES } from "@/server/rate-limit";
import { checkFillTime, checkHoneypot, requireChallengeIfSuspicious } from "@/server/services/antibot";
import { abandonIdempotent, beginIdempotent, completeIdempotent, validateIdempotencyKey } from "@/server/services/idempotency";
import { registerStudent, type RegistrationOutcome } from "@/server/services/registration.service";

export const runtime = "nodejs";

function successBody(o: RegistrationOutcome) {
  return {
    registration: {
      publicId: o.publicId,
      code: o.code,
      studentName: o.studentName,
      workshop: { ...o.workshop, date: o.workshop.date.toISOString() },
      createdAt: o.createdAt.toISOString(),
    },
    redirect: `/inscripcion/${o.publicId}`,
  };
}

/** Errores definitivos que se memorizan para la misma Idempotency-Key. */
const FINAL_CODES = new Set(["WORKSHOP_FULL", "ALREADY_REGISTERED", "WORKSHOP_CLOSED", "WORKSHOP_NOT_OPEN", "NOT_FOUND", "PROFILE_INCOMPLETE"]);

/**
 * POST /api/registrations
 * Header obligatorio: Idempotency-Key: <UUID>
 */
export const POST = route(async (req: NextRequest) => {
  const { ip, ipHash } = await publicRateLimit(req);
  const student = await requireStudent(req);
  const key = validateIdempotencyKey(req.headers.get("idempotency-key"));
  const body = await parseJson(req, createRegistrationSchema);

  const { turnstileToken: _t, ...hashable } = body;
  const idem = await beginIdempotent(`registration:${student.studentId}`, key, canonicalHash(hashable));
  if (idem.kind === "replay") return json(idem.body, idem.status, { "Idempotent-Replayed": "true" });

  try {
    await checkRateLimit(RULES.formIp, ip);
    await checkRateLimit(RULES.registrationStudent, student.studentId);
    await checkHoneypot(body.website_url, ip);
    await requireChallengeIfSuspicious(body.turnstileToken, ip);

    const reservation = body.reservationId
      ? await db().reservation.findFirst({ where: { id: body.reservationId, studentId: student.studentId } })
      : null;
    if (reservation) await checkFillTime(reservation.createdAt, ip);

    const outcome = await registerStudent({
      studentId: student.studentId,
      workshopId: body.workshopId,
      reservationId: body.reservationId,
      profile: body.profile,
      ipHash,
      // La respuesta idempotente se guarda en la MISMA transacción que la inscripción.
      onCommitting: (tx, o) => completeIdempotent(idem.id, 201, successBody(o), tx),
    });
    return json(successBody(outcome), 201);
  } catch (err) {
    if (isAppError(err) && FINAL_CODES.has(err.code)) {
      const e = err as AppError;
      await completeIdempotent(idem.id, e.status, { error: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) });
      return errorResponse(e);
    }
    await abandonIdempotent(idem.id);
    throw err;
  }
});
