import { db, withTransaction, isUniqueViolation } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { computePublicStatus } from "@/lib/workshop-status";
import type { z } from "zod";
import type { createWorkshopSchema, updateWorkshopSchema } from "@/schemas";
import { lockWorkshop } from "@/server/repositories/workshop-lock.repository";
import { audit } from "./audit.service";
import { publish, type RealtimeEvent } from "./realtime";
import { fillFromWaitlist } from "./waitlist.service";
import { kickDispatcher } from "./email/outbox";
import type { WorkshopStatus } from "@/generated/prisma/enums";

type CreateInput = z.infer<typeof createWorkshopSchema>;
type UpdateInput = z.infer<typeof updateWorkshopSchema>;

/** Lugares retenidos por reservas vigentes, agrupados por taller. */
export async function heldSeatsByWorkshop(): Promise<Map<string, number>> {
  const rows = await db().reservation.groupBy({
    by: ["workshopId"],
    where: { status: "ACTIVE", expiresAt: { gt: new Date() } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.workshopId, r._count._all]));
}

/** Lista pública: solo datos no sensibles; estado derivado en el servidor. */
export async function listPublicWorkshops() {
  const [workshops, held] = await Promise.all([
    db().workshop.findMany({
      where: { archivedAt: null, status: { in: ["OPEN", "FULL", "CLOSED", "FINISHED"] } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    heldSeatsByWorkshop(),
  ]);
  return workshops.map((w) => toPublicWorkshop(w, held.get(w.id) ?? 0));
}

export async function getPublicWorkshop(idOrSlug: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const w = await db().workshop.findFirst({
    where: { ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }), archivedAt: null, status: { not: "DRAFT" } },
  });
  if (!w) return null;
  const held = await db().reservation.count({ where: { workshopId: w.id, status: "ACTIVE", expiresAt: { gt: new Date() } } });
  const waiting = await db().waitlistEntry.count({ where: { workshopId: w.id, status: "WAITING" } });
  return { ...toPublicWorkshop(w, held), waitlistCount: waiting };
}

type WorkshopRow = Awaited<ReturnType<ReturnType<typeof db>["workshop"]["findFirstOrThrow"]>>;

export function toPublicWorkshop(w: WorkshopRow, held: number) {
  const ps = computePublicStatus({
    status: w.status,
    maxCapacity: w.maxCapacity,
    registeredCount: w.registeredCount,
    heldSeats: held,
    registrationOpensAt: w.registrationOpensAt,
    registrationClosesAt: w.registrationClosesAt,
  });
  return {
    id: w.id,
    slug: w.slug,
    name: w.name,
    description: w.description,
    instructor: w.instructorName,
    date: w.date.toISOString(),
    startTime: w.startTime,
    endTime: w.endTime,
    location: w.location,
    level: w.level,
    imageUrl: w.imageUrl,
    icon: w.icon,
    maxCapacity: w.maxCapacity,
    registered: w.registeredCount,
    available: ps.available,
    publicStatus: ps.status,
    registrationOpensAt: w.registrationOpensAt?.toISOString() ?? null,
  };
}

function toDate(d: string) {
  return new Date(`${d}T00:00:00.000Z`);
}

export async function createWorkshop(input: CreateInput, adminId: string, ipHash: string | null) {
  try {
    const w = await db().workshop.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: input.description,
        instructorName: input.instructorName,
        instructorAdminId: input.instructorAdminId ?? null,
        date: toDate(input.date),
        startTime: input.startTime,
        endTime: input.endTime,
        location: input.location,
        level: input.level,
        maxCapacity: input.maxCapacity,
        imageUrl: input.imageUrl || null,
        icon: input.icon || null,
        codePrefix: input.codePrefix ?? input.slug.replace(/[^a-z0-9]/g, "").slice(0, 3).toUpperCase(),
        eventKey: input.eventKey ?? "default",
        status: input.status,
        registrationOpensAt: input.registrationOpensAt ? new Date(input.registrationOpensAt) : null,
        registrationClosesAt: input.registrationClosesAt ? new Date(input.registrationClosesAt) : null,
      },
    });
    await audit({ action: "WORKSHOP_CREATED", adminId, resourceType: "workshop", resourceId: w.id, metadata: { slug: w.slug }, ipHash });
    void publish({ type: "workshop.updated", workshopId: w.id, at: new Date().toISOString() });
    return w;
  } catch (err) {
    if (isUniqueViolation(err)) throw Errors.conflict("SLUG_TAKEN", "Ya existe un taller con ese slug.");
    throw err;
  }
}

/** Edición de datos generales. La capacidad se cambia SIEMPRE por changeCapacity(). */
export async function updateWorkshop(id: string, input: UpdateInput, adminId: string, ipHash: string | null) {
  const { maxCapacity, ...rest } = input;
  const existing = await db().workshop.findUnique({ where: { id } });
  if (!existing) throw Errors.notFound("El taller no existe.");
  const start = rest.startTime ?? existing.startTime;
  const end = rest.endTime ?? existing.endTime;
  if (end <= start) throw Errors.unprocessable("INVALID_TIME", "La hora final debe ser posterior a la de inicio.");
  try {
    const data: Record<string, unknown> = { ...rest };
    if (rest.date) data.date = toDate(rest.date);
    if ("registrationOpensAt" in rest) data.registrationOpensAt = rest.registrationOpensAt ? new Date(rest.registrationOpensAt) : null;
    if ("registrationClosesAt" in rest) data.registrationClosesAt = rest.registrationClosesAt ? new Date(rest.registrationClosesAt) : null;
    if ("imageUrl" in rest) data.imageUrl = rest.imageUrl || null;
    const w = await db().workshop.update({ where: { id }, data });
    const changed = Object.keys(rest).filter((k) => JSON.stringify((existing as Record<string, unknown>)[k]) !== JSON.stringify(data[k]));
    await audit({ action: "WORKSHOP_UPDATED", adminId, resourceType: "workshop", resourceId: id, metadata: { changed }, ipHash });
    if (maxCapacity !== undefined && maxCapacity !== existing.maxCapacity) await changeCapacity(id, maxCapacity, adminId, ipHash);
    void publish({ type: "workshop.updated", workshopId: id, at: new Date().toISOString() });
    return w;
  } catch (err) {
    if (isUniqueViolation(err)) throw Errors.conflict("SLUG_TAKEN", "Ya existe un taller con ese slug.");
    throw err;
  }
}

/**
 * Cambio de capacidad con bloqueo de fila. Nunca permite una capacidad menor
 * al número actual de inscritos. Si aumenta, promueve de la lista de espera.
 */
export async function changeCapacity(id: string, newMax: number, adminId: string, ipHash: string | null) {
  const events: RealtimeEvent[] = [];
  const res = await withTransaction(
    async (tx) => {
      events.length = 0;
      const w = await lockWorkshop(tx, id);
      if (newMax < w.registeredCount) {
        throw Errors.unprocessable(
          "CAPACITY_BELOW_REGISTERED",
          "No puedes establecer una capacidad inferior al número actual de estudiantes inscritos.",
          { registered: w.registeredCount },
        );
      }
      let status = w.status as WorkshopStatus;
      if (status === "FULL" && newMax > w.registeredCount) status = "OPEN";
      if (status === "OPEN" && newMax === w.registeredCount) status = "FULL";
      await tx.workshop.update({ where: { id }, data: { maxCapacity: newMax, status } });
      await audit(
        {
          action: "CAPACITY_CHANGED",
          adminId,
          resourceType: "workshop",
          resourceId: id,
          metadata: { from: w.maxCapacity, to: newMax, registered: w.registeredCount },
          ipHash,
        },
        tx,
      );
      const promoted = newMax > w.maxCapacity ? await fillFromWaitlist(tx, { ...w, maxCapacity: newMax, status }, events) : 0;
      return { from: w.maxCapacity, to: newMax, promoted };
    },
    { label: "change_capacity" },
  );
  events.push({ type: "workshop.updated", workshopId: id, at: new Date().toISOString() });
  for (const e of events) void publish(e);
  kickDispatcher();
  return res;
}

const ACTION_STATUS: Record<string, WorkshopStatus> = {
  open: "OPEN",
  close: "CLOSED",
  cancel: "CANCELLED",
  finish: "FINISHED",
};

export async function workshopAction(id: string, action: string, adminId: string, ipHash: string | null) {
  if (action === "duplicate") return duplicateWorkshop(id, adminId, ipHash);
  const result = await withTransaction(async (tx) => {
    const w = await lockWorkshop(tx, id);
    if (action === "archive" || action === "unarchive") {
      await tx.workshop.update({ where: { id }, data: { archivedAt: action === "archive" ? new Date() : null } });
    } else {
      let status = ACTION_STATUS[action];
      if (!status) throw Errors.badRequest("Acción desconocida.");
      if (status === "OPEN" && w.registeredCount >= w.maxCapacity) status = "FULL";
      await tx.workshop.update({ where: { id }, data: { status } });
      if (status === "CANCELLED" || status === "CLOSED") {
        await tx.reservation.updateMany({ where: { workshopId: id, status: "ACTIVE" }, data: { status: "RELEASED" } });
      }
    }
    await audit({ action: "WORKSHOP_STATUS_CHANGED", adminId, resourceType: "workshop", resourceId: id, metadata: { action, from: w.status }, ipHash }, tx);
    return { ok: true };
  });
  void publish({ type: "workshop.updated", workshopId: id, at: new Date().toISOString() });
  return result;
}

async function duplicateWorkshop(id: string, adminId: string, ipHash: string | null) {
  const w = await db().workshop.findUnique({ where: { id } });
  if (!w) throw Errors.notFound();
  let slug = `${w.slug}-copia`.slice(0, 80);
  for (let i = 2; await db().workshop.findUnique({ where: { slug }, select: { id: true } }); i++) slug = `${w.slug}-copia-${i}`.slice(0, 80);
  const copy = await db().workshop.create({
    data: {
      slug,
      name: `${w.name} (copia)`.slice(0, 120),
      description: w.description,
      instructorName: w.instructorName,
      instructorAdminId: w.instructorAdminId,
      date: w.date,
      startTime: w.startTime,
      endTime: w.endTime,
      location: w.location,
      level: w.level,
      maxCapacity: w.maxCapacity,
      imageUrl: w.imageUrl,
      icon: w.icon,
      codePrefix: w.codePrefix,
      eventKey: w.eventKey,
      status: "DRAFT",
    },
  });
  await audit({ action: "WORKSHOP_DUPLICATED", adminId, resourceType: "workshop", resourceId: copy.id, metadata: { from: w.slug }, ipHash });
  return { ok: true, id: copy.id };
}

/** Listado administrativo con métricas por taller. */
export async function listAdminWorkshops(scopeIds?: string[]) {
  const [workshops, held, waiting, checkins] = await Promise.all([
    db().workshop.findMany({
      where: scopeIds ? { id: { in: scopeIds } } : {},
      orderBy: [{ archivedAt: "asc" }, { date: "asc" }, { startTime: "asc" }],
      include: { instructorAdmin: { select: { id: true, name: true } } },
    }),
    heldSeatsByWorkshop(),
    db().waitlistEntry.groupBy({ by: ["workshopId"], where: { status: "WAITING" }, _count: { _all: true } }),
    db().registration.groupBy({ by: ["workshopId"], where: { status: "CHECKED_IN" }, _count: { _all: true } }),
  ]);
  const wMap = new Map(waiting.map((r) => [r.workshopId, r._count._all]));
  const cMap = new Map(checkins.map((r) => [r.workshopId, r._count._all]));
  return workshops.map((w) => ({
    ...toPublicWorkshop(w, held.get(w.id) ?? 0),
    status: w.status,
    archived: !!w.archivedAt,
    held: held.get(w.id) ?? 0,
    waitlist: wMap.get(w.id) ?? 0,
    checkins: cMap.get(w.id) ?? 0,
    codePrefix: w.codePrefix,
    eventKey: w.eventKey,
    instructorAdmin: w.instructorAdmin,
    registrationClosesAt: w.registrationClosesAt?.toISOString() ?? null,
  }));
}
