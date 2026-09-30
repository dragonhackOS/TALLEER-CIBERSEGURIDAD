import type { Tx } from "@/lib/db";
import { adminNotificationEmails } from "@/lib/env";
import { enqueueEmail } from "./email/outbox";

/**
 * Notificaciones administrativas. Todas se encolan en el OUTBOX dentro de la
 * transacción, por lo que SOLO se envían después de un COMMIT exitoso.
 * Destinatarios: ADMIN_NOTIFICATION_EMAILS (nunca en el código ni en APIs públicas).
 */

export async function notifyNewRegistration(
  tx: Tx,
  data: {
    registrationId: string;
    studentName: string;
    email: string;
    classroom: string;
    semester: number;
    workshopName: string;
    code: string;
    registered: number;
    capacity: number;
    available: number;
    createdAt: Date;
    promotedFromWaitlist?: boolean;
  },
) {
  const template = data.promotedFromWaitlist ? "ADMIN_WAITLIST_PROMOTED" : "ADMIN_NEW_REGISTRATION";
  await enqueueEmail(tx, {
    to: adminNotificationEmails(),
    template,
    subject: `${data.promotedFromWaitlist ? "Promovido desde lista de espera" : "Nueva inscripción"} — ${data.workshopName}`,
    payload: { ...data, createdAt: data.createdAt.toISOString() },
    relatedType: "registration",
    relatedId: data.registrationId,
  });
}

export async function notifyStudentConfirmation(tx: Tx, registrationId: string, email: string, workshopName: string, promoted = false) {
  await enqueueEmail(tx, {
    to: [email],
    template: promoted ? "STUDENT_WAITLIST_PROMOTED" : "STUDENT_CONFIRMATION",
    subject: `Inscripción confirmada — ${workshopName}`,
    payload: { registrationId },
    relatedType: "registration",
    relatedId: registrationId,
  });
}

export async function notifyCancellation(
  tx: Tx,
  data: {
    registrationId: string;
    studentName: string;
    email: string;
    workshopName: string;
    code: string;
    registered: number;
    capacity: number;
    available: number;
    at: Date;
    by: string;
  },
) {
  await enqueueEmail(tx, {
    to: adminNotificationEmails(),
    template: "ADMIN_CANCELLATION",
    subject: `Cancelación — ${data.workshopName}`,
    payload: { ...data, at: data.at.toISOString() },
    relatedType: "registration",
    relatedId: data.registrationId,
  });
  await enqueueEmail(tx, {
    to: [data.email],
    template: "STUDENT_CANCELLATION",
    subject: `Inscripción cancelada — ${data.workshopName}`,
    payload: { workshopName: data.workshopName, code: data.code },
    relatedType: "registration",
    relatedId: data.registrationId,
  });
}

type AlertKind = "PCT_80" | "PCT_90" | "FULL" | "LAST_SEAT";

async function claimAlert(tx: Tx, workshopId: string, kind: AlertKind, capacity: number, registered: number): Promise<boolean> {
  // INSERT ... ON CONFLICT DO NOTHING: garantiza que cada alerta se envíe una sola vez
  // por taller y capacidad (si la capacidad cambia, las alertas se rearman).
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO capacity_notification_events (id, workshop_id, kind, capacity_snapshot, registered_snapshot, created_at)
    VALUES (gen_random_uuid(), ${workshopId}::uuid, ${kind}, ${capacity}, ${registered}, timezone('utc', now()))
    ON CONFLICT (workshop_id, kind, capacity_snapshot) DO NOTHING
    RETURNING id`;
  return rows.length === 1;
}

/**
 * Evalúa umbrales 80% / 90% / 100% y "último lugar".
 * Si se cruzan varios umbrales de golpe, solo se notifica el más alto
 * (los inferiores se marcan como enviados para no generar ruido).
 */
export async function evaluateCapacityAlerts(
  tx: Tx,
  w: { id: string; name: string },
  registered: number,
  capacity: number,
): Promise<AlertKind[]> {
  const ratio = registered / capacity;
  const sent: AlertKind[] = [];
  const pctKinds: AlertKind[] = [];
  if (ratio >= 0.8) pctKinds.push("PCT_80");
  if (ratio >= 0.9) pctKinds.push("PCT_90");
  if (registered >= capacity) pctKinds.push("FULL");

  const newlyClaimed: AlertKind[] = [];
  for (const k of pctKinds) if (await claimAlert(tx, w.id, k, capacity, registered)) newlyClaimed.push(k);
  const top = newlyClaimed[newlyClaimed.length - 1];
  const to = adminNotificationEmails();
  const base = { workshopId: w.id, workshopName: w.name, registered, capacity, available: Math.max(0, capacity - registered) };

  if (top === "FULL") {
    await enqueueEmail(tx, { to, template: "ADMIN_WORKSHOP_FULL", subject: `Taller lleno — ${w.name}`, payload: base, relatedType: "workshop", relatedId: w.id });
    sent.push("FULL");
  } else if (top === "PCT_90" || top === "PCT_80") {
    const percent = top === "PCT_90" ? 90 : 80;
    await enqueueEmail(tx, {
      to,
      template: "ADMIN_CAPACITY_ALERT",
      subject: `Ocupación ${percent}% — ${w.name}`,
      payload: { ...base, percent },
      relatedType: "workshop",
      relatedId: w.id,
    });
    sent.push(top);
  }

  if (capacity > 1 && capacity - registered === 1 && (await claimAlert(tx, w.id, "LAST_SEAT", capacity, registered))) {
    await enqueueEmail(tx, { to, template: "ADMIN_LAST_SEAT", subject: `Último lugar disponible — ${w.name}`, payload: base, relatedType: "workshop", relatedId: w.id });
    sent.push("LAST_SEAT");
  }
  return sent;
}
