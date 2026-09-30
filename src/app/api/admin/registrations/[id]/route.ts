import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { json, parseJson, route, type RouteContext } from "@/server/http/handler";
import { registrationActionSchema, uuid } from "@/schemas";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { can, isScopedToAssignedWorkshops } from "@/server/auth/rbac";
import { getRegistrationDetail } from "@/server/services/registration-query.service";
import { cancelRegistration, moveRegistration } from "@/server/services/registration.service";
import { checkIn, markNoShow, undoCheckIn } from "@/server/services/checkin.service";
import { audit } from "@/server/services/audit.service";
import { enqueueEmail, kickDispatcher } from "@/server/services/email/outbox";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  const a = await requireAdmin(req, "registrations:read");
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  const detail = await getRegistrationDetail(id);
  if (!detail) throw Errors.notFound();
  if (isScopedToAssignedWorkshops(a.role) && !(await instructorWorkshopIds(a.adminId)).includes(detail.reg.workshopId)) throw Errors.notFound();
  const { reg } = detail;
  return json({
    registration: {
      id: reg.id,
      publicId: reg.publicId,
      code: reg.registrationCode,
      status: reg.status,
      source: reg.source,
      qrVersion: reg.qrVersion,
      createdAt: reg.createdAt,
      cancelledAt: reg.cancelledAt,
      cancelReason: reg.cancelReason,
      student: reg.student,
      workshop: { ...reg.workshop, date: reg.workshop.date.toISOString().slice(0, 10) },
      attendance: reg.attendance,
    },
    history: detail.history.map((h) => ({ id: h.id, action: h.action, actorType: h.actorType, admin: h.admin, metadata: h.metadata, createdAt: h.createdAt })),
    emails: detail.emails,
  });
});

/** PATCH — acciones administrativas (todas auditadas). */
export const PATCH = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  const a = await requireAdmin(req);
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  const body = await parseJson(req, registrationActionSchema);

  const checkinActions = ["checkin", "undo_checkin", "mark_no_show"];
  const needed = checkinActions.includes(body.action) ? "checkin:write" : "registrations:write";
  if (!can(a.role, needed)) throw Errors.forbidden();

  const reg = await db().registration.findUnique({ where: { id }, include: { student: true, workshop: true } });
  if (!reg) throw Errors.notFound();
  if (isScopedToAssignedWorkshops(a.role) && !(await instructorWorkshopIds(a.adminId)).includes(reg.workshopId)) throw Errors.notFound();

  switch (body.action) {
    case "cancel":
      return json(await cancelRegistration({ registrationId: id, by: { type: "ADMIN", adminId: a.adminId }, reason: body.reason, ipHash: a.ipHash }));
    case "move":
      await moveRegistration({ registrationId: id, targetWorkshopId: body.targetWorkshopId, adminId: a.adminId, ipHash: a.ipHash });
      return json({ ok: true });
    case "checkin":
      return json(await checkIn(a, { registrationId: id }));
    case "undo_checkin":
      await undoCheckIn(a, id);
      return json({ ok: true });
    case "mark_no_show":
      await markNoShow(a, id);
      return json({ ok: true });
    case "resend_confirmation":
    case "regenerate_qr": {
      if (reg.status === "CANCELLED") throw Errors.conflict("NOT_ACTIVE", "La inscripción está cancelada.");
      await db().$transaction(async (tx) => {
        if (body.action === "regenerate_qr") {
          // Incrementar la versión invalida el QR anterior.
          await tx.registration.update({ where: { id }, data: { qrVersion: { increment: 1 } } });
        }
        await enqueueEmail(tx, {
          to: [reg.student.email],
          template: "STUDENT_CONFIRMATION",
          subject: `Inscripción confirmada — ${reg.workshop.name}`,
          payload: { registrationId: id },
          relatedType: "registration",
          relatedId: id,
        });
        await audit(
          { action: body.action === "regenerate_qr" ? "QR_REGENERATED" : "CONFIRMATION_RESENT", adminId: a.adminId, resourceType: "registration", resourceId: id, ipHash: a.ipHash },
          tx,
        );
      });
      kickDispatcher();
      return json({ ok: true });
    }
  }
});
