import type { Tx } from "@/lib/db";
import { Errors } from "@/lib/errors";

/**
 * Primitivas de concurrencia. Orden de bloqueo GLOBAL (evita deadlocks):
 *   1) lock consultivo del alumno   2) fila(s) del taller (por id ascendente)
 */
export interface LockedWorkshop {
  id: string;
  name: string;
  slug: string;
  maxCapacity: number;
  registeredCount: number;
  status: string;
  eventKey: string;
  codePrefix: string;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  archivedAt: Date | null;
  date: Date;
  startTime: string;
  endTime: string;
  location: string;
}

/** Serializa operaciones de un mismo alumno (política "un taller por evento"). */
export async function lockStudent(tx: Tx, studentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`student:${studentId}`}, 0))`;
}

/** SELECT ... FOR UPDATE sobre la fila del taller. */
export async function lockWorkshop(tx: Tx, workshopId: string): Promise<LockedWorkshop> {
  const rows = await tx.$queryRaw<
    {
      id: string;
      name: string;
      slug: string;
      max_capacity: number;
      registered_count: number;
      status: string;
      event_key: string;
      code_prefix: string;
      registration_opens_at: Date | null;
      registration_closes_at: Date | null;
      archived_at: Date | null;
      date: Date;
      start_time: string;
      end_time: string;
      location: string;
    }[]
  >`SELECT id, name, slug, max_capacity, registered_count, status::text AS status, event_key, code_prefix,
           registration_opens_at, registration_closes_at, archived_at, date, start_time, end_time, location
      FROM workshops WHERE id = ${workshopId}::uuid FOR UPDATE`;
  const r = rows[0];
  if (!r) throw Errors.notFound("El taller no existe.");
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    maxCapacity: Number(r.max_capacity),
    registeredCount: Number(r.registered_count),
    status: r.status,
    eventKey: r.event_key,
    codePrefix: r.code_prefix,
    registrationOpensAt: r.registration_opens_at,
    registrationClosesAt: r.registration_closes_at,
    archivedAt: r.archived_at,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    location: r.location,
  };
}

/** Bloquea varios talleres en orden determinista. */
export async function lockWorkshops(tx: Tx, ids: string[]): Promise<Map<string, LockedWorkshop>> {
  const map = new Map<string, LockedWorkshop>();
  for (const id of [...new Set(ids)].sort()) map.set(id, await lockWorkshop(tx, id));
  return map;
}

/** Lugares retenidos por reservas vigentes (opcionalmente excluyendo una). */
export async function heldSeats(tx: Tx, workshopId: string, excludeReservationId?: string | null): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM reservations
     WHERE workshop_id = ${workshopId}::uuid
       AND status = 'ACTIVE'
       AND expires_at > timezone('utc', now())
       AND (${excludeReservationId ?? null}::uuid IS NULL OR id <> ${excludeReservationId ?? null}::uuid)`;
  return Number(rows[0]?.n ?? 0);
}

export async function waitingCount(tx: Tx, workshopId: string): Promise<number> {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM waitlist_entries WHERE workshop_id = ${workshopId}::uuid AND status = 'WAITING'`;
  return Number(rows[0]?.n ?? 0);
}

/**
 * Incremento atómico y condicionado. Aunque ya tenemos el lock, la condición
 * `registered_count < max_capacity` y el CHECK de la tabla garantizan que
 * JAMÁS exista sobrecupo.
 */
export async function incrementRegistered(tx: Tx, workshopId: string): Promise<{ registered: number; capacity: number }> {
  const rows = await tx.$queryRaw<{ registered_count: number; max_capacity: number }[]>`
    UPDATE workshops
       SET registered_count = registered_count + 1,
           status = CASE WHEN registered_count + 1 >= max_capacity AND status = 'OPEN' THEN 'FULL'::"WorkshopStatus" ELSE status END,
           updated_at = timezone('utc', now())
     WHERE id = ${workshopId}::uuid AND registered_count < max_capacity
     RETURNING registered_count, max_capacity`;
  if (rows.length !== 1) throw Errors.workshopFull();
  return { registered: Number(rows[0].registered_count), capacity: Number(rows[0].max_capacity) };
}

export async function decrementRegistered(tx: Tx, workshopId: string): Promise<{ registered: number; capacity: number }> {
  const rows = await tx.$queryRaw<{ registered_count: number; max_capacity: number }[]>`
    UPDATE workshops
       SET registered_count = registered_count - 1,
           status = CASE WHEN status = 'FULL' THEN 'OPEN'::"WorkshopStatus" ELSE status END,
           updated_at = timezone('utc', now())
     WHERE id = ${workshopId}::uuid AND registered_count > 0
     RETURNING registered_count, max_capacity`;
  if (rows.length !== 1) throw new Error("Contador de inscritos inconsistente");
  return { registered: Number(rows[0].registered_count), capacity: Number(rows[0].max_capacity) };
}

/** Valida que el taller acepte inscripciones en este momento. */
export function assertAcceptingRegistrations(w: LockedWorkshop, now = new Date()) {
  if (w.archivedAt) throw Errors.workshopClosed();
  if (w.status === "FULL") throw Errors.workshopFull({ waitlistAvailable: true });
  if (w.status !== "OPEN") throw Errors.workshopClosed();
  if (w.registrationOpensAt && w.registrationOpensAt > now) throw Errors.workshopNotOpenYet();
  if (w.registrationClosesAt && w.registrationClosesAt < now) throw Errors.workshopClosed();
}
