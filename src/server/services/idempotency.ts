import { db, isUniqueViolation, type Tx } from "@/lib/db";
import { Errors } from "@/lib/errors";

/**
 * Idempotencia para POST /api/registrations (cabecera Idempotency-Key).
 * - Misma clave + mismo cuerpo  → se devuelve la respuesta original.
 * - Misma clave + otro cuerpo   → 422 IDEMPOTENCY_KEY_REUSED.
 * - Misma clave aún procesando  → 409 REQUEST_IN_PROGRESS.
 */
const TTL_HOURS = 24;

export type IdempotencyBegin =
  | { kind: "new"; id: string }
  | { kind: "replay"; status: number; body: unknown };

export function validateIdempotencyKey(key: string | null): string {
  if (!key || !/^[A-Za-z0-9_-]{16,80}$/.test(key)) {
    throw Errors.badRequest("Falta la cabecera Idempotency-Key (UUID).");
  }
  return key;
}

export async function beginIdempotent(scope: string, key: string, requestHash: string): Promise<IdempotencyBegin> {
  try {
    const row = await db().idempotencyKey.create({
      data: { scope, key, requestHash, expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000) },
    });
    return { kind: "new", id: row.id };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await db().idempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
    if (!existing) throw Errors.conflict("REQUEST_IN_PROGRESS", "Tu solicitud se está procesando.");
    if (existing.requestHash !== requestHash) {
      throw Errors.unprocessable("IDEMPOTENCY_KEY_REUSED", "La clave de idempotencia ya se usó con otros datos.");
    }
    if (existing.state === "COMPLETED" && existing.responseStatus) {
      return { kind: "replay", status: existing.responseStatus, body: existing.responseBody };
    }
    throw Errors.conflict("REQUEST_IN_PROGRESS", "Tu solicitud se está procesando. Consulta tu estado en unos segundos.");
  }
}

export async function completeIdempotent(id: string, status: number, body: unknown, tx?: Tx) {
  await (tx ?? db()).idempotencyKey.update({
    where: { id },
    data: { state: "COMPLETED", responseStatus: status, responseBody: body as object },
  });
}

/** Si la solicitud falló de forma no definitiva (500), liberamos la clave para reintentar. */
export async function abandonIdempotent(id: string) {
  await db().idempotencyKey.delete({ where: { id } }).catch(() => undefined);
}
