import QRCode from "qrcode";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { signQrToken } from "@/lib/crypto";
import { formatDateTime, formatWorkshopDate, LEVEL_LABEL } from "@/lib/format";

export type TemplateName =
  | "STUDENT_CONFIRMATION"
  | "STUDENT_WAITLIST_PROMOTED"
  | "STUDENT_CANCELLATION"
  | "STUDENT_WAITLIST_JOINED"
  | "ADMIN_NEW_REGISTRATION"
  | "ADMIN_CAPACITY_ALERT"
  | "ADMIN_LAST_SEAT"
  | "ADMIN_WORKSHOP_FULL"
  | "ADMIN_CANCELLATION"
  | "ADMIN_WAITLIST_PROMOTED";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer; cid?: string; contentType?: string }[];
}

/** Escapado HTML obligatorio para todo dato dinámico (evita XSS en correos). */
export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  const school = esc(env().SCHOOL_NAME);
  const button = cta
    ? `<tr><td style="padding:8px 32px 28px"><a href="${esc(cta.url)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;font-size:14px">${esc(cta.label)}</a></td></tr>`
    : "";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0b2a5b;padding:20px 32px;color:#ffffff"><div style="font-size:12px;letter-spacing:.12em;opacity:.8">${school}</div><div style="font-size:18px;font-weight:700;margin-top:2px">Talleres</div></td></tr>
<tr><td style="padding:28px 32px 8px"><h1 style="margin:0 0 12px;font-size:20px;color:#0b2a5b">${esc(title)}</h1>${body}</td></tr>
${button}
<tr><td style="padding:16px 32px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0">Mensaje automático de la plataforma de talleres. No respondas a este correo.</td></tr>
</table></td></tr></table></body></html>`;
}

function rows(pairs: [string, unknown][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;margin:8px 0 16px">${pairs
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#64748b;width:42%;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

function text(title: string, pairs: [string, unknown][], footer?: string) {
  return [title.toUpperCase(), "", ...pairs.map(([k, v]) => `${k}: ${v ?? ""}`), "", footer ?? ""].join("\n");
}

const appUrl = () => env().APP_URL.replace(/\/$/, "");

async function studentRegistrationEmail(registrationId: string, promoted: boolean): Promise<RenderedEmail> {
  const reg = await db().registration.findUniqueOrThrow({
    where: { id: registrationId },
    include: { student: true, workshop: true },
  });
  const qrPng = await QRCode.toBuffer(signQrToken(reg.publicId, reg.qrVersion), {
    type: "png",
    width: 320,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0b2a5b", light: "#ffffff" },
  });
  const title = promoted ? "¡Tienes un lugar! Inscripción confirmada" : "Inscripción confirmada";
  const pairs: [string, unknown][] = [
    ["Nombre", reg.student.fullName],
    ["Taller", reg.workshop.name],
    ["Fecha", formatWorkshopDate(reg.workshop.date, true)],
    ["Horario", `${reg.workshop.startTime} - ${reg.workshop.endTime}`],
    ["Lugar", reg.workshop.location],
    ["Nivel", LEVEL_LABEL[reg.workshop.level]],
    ["Código", reg.registrationCode],
  ];
  const intro = promoted
    ? `<p style="font-size:14px;line-height:1.6;margin:0 0 8px">Se liberó un lugar y fuiste promovido desde la lista de espera.</p>`
    : `<p style="font-size:14px;line-height:1.6;margin:0 0 8px">Tu lugar en el taller quedó registrado.</p>`;
  const body = `${intro}${rows(pairs)}
<div style="text-align:center;margin:8px 0 12px"><img src="cid:qr-code" alt="Código QR de asistencia" width="200" height="200" style="border:1px solid #e2e8f0;border-radius:12px;padding:8px"/>
<div style="font-size:12px;color:#64748b;margin-top:6px">Presenta este QR el día del taller para registrar tu asistencia.</div></div>`;
  return {
    subject: `${promoted ? "Lugar confirmado" : "Inscripción confirmada"} — ${reg.workshop.name}`,
    html: layout(title, body, { label: "VER MI INSCRIPCIÓN", url: `${appUrl()}/inscripcion/${reg.publicId}` }),
    text: text(title, pairs, `Consulta tu inscripción: ${appUrl()}/inscripcion/${reg.publicId}`),
    attachments: [{ filename: "qr.png", content: qrPng, cid: "qr-code", contentType: "image/png" }],
  };
}

type P = Record<string, unknown>;

export async function renderTemplate(template: TemplateName, payload: P): Promise<RenderedEmail> {
  switch (template) {
    case "STUDENT_CONFIRMATION":
      return studentRegistrationEmail(String(payload.registrationId), false);
    case "STUDENT_WAITLIST_PROMOTED":
      return studentRegistrationEmail(String(payload.registrationId), true);

    case "STUDENT_CANCELLATION": {
      const pairs: [string, unknown][] = [
        ["Taller", payload.workshopName],
        ["Código", payload.code],
      ];
      return {
        subject: `Inscripción cancelada — ${payload.workshopName}`,
        html: layout("Inscripción cancelada", `<p style="font-size:14px">Tu inscripción fue cancelada.</p>${rows(pairs)}`),
        text: text("Inscripción cancelada", pairs),
      };
    }

    case "STUDENT_WAITLIST_JOINED": {
      const pairs: [string, unknown][] = [
        ["Taller", payload.workshopName],
        ["Posición", payload.position],
      ];
      return {
        subject: `Lista de espera — ${payload.workshopName}`,
        html: layout(
          "Estás en la lista de espera",
          `<p style="font-size:14px;line-height:1.6">Si se libera un lugar te inscribiremos automáticamente y te avisaremos por correo.</p>${rows(pairs)}`,
        ),
        text: text("Estás en la lista de espera", pairs),
      };
    }

    case "ADMIN_NEW_REGISTRATION":
    case "ADMIN_WAITLIST_PROMOTED": {
      const promoted = template === "ADMIN_WAITLIST_PROMOTED";
      const { date, time } = formatDateTime(String(payload.createdAt));
      const pairs: [string, unknown][] = [
        ["Nombre", payload.studentName],
        ["Correo", payload.email],
        ["Salón", payload.classroom],
        ["Semestre", payload.semester],
        ["Taller", payload.workshopName],
        ["Fecha", date],
        ["Hora", time],
        ["Código", payload.code],
        ["Capacidad", `${payload.registered} / ${payload.capacity}`],
        ["Lugares restantes", payload.available],
      ];
      const title = promoted ? "Nuevo alumno promovido desde lista de espera" : "Nueva inscripción";
      return {
        subject: `${promoted ? "Promovido desde lista de espera" : "Nueva inscripción"} — ${payload.workshopName}`,
        html: layout(title, rows(pairs), { label: "VER EN PANEL", url: `${appUrl()}/admin/registrations/${payload.registrationId}` }),
        text: text(title, pairs, `Ver en panel: ${appUrl()}/admin/registrations/${payload.registrationId}`),
      };
    }

    case "ADMIN_CAPACITY_ALERT": {
      const pairs: [string, unknown][] = [
        ["Taller", payload.workshopName],
        ["Ocupación", `${payload.registered} / ${payload.capacity} (${payload.percent}%)`],
        ["Lugares disponibles", payload.available],
      ];
      return {
        subject: `Ocupación ${payload.percent}% — ${payload.workshopName}`,
        html: layout(
          `El taller alcanzó el ${payload.percent}% de ocupación`,
          rows(pairs),
          { label: "VER INSCRITOS", url: `${appUrl()}/admin/registrations?workshopId=${payload.workshopId}` },
        ),
        text: text(`Ocupación ${payload.percent}%`, pairs),
      };
    }

    case "ADMIN_LAST_SEAT": {
      const pairs: [string, unknown][] = [["Ocupación", `${payload.registered} / ${payload.capacity}`]];
      return {
        subject: `Último lugar disponible — ${payload.workshopName}`,
        html: layout(
          "Último lugar disponible",
          `<p style="font-size:14px">El taller <strong>${esc(payload.workshopName)}</strong> tiene solamente un lugar disponible.</p>${rows(pairs)}`,
          { label: "VER INSCRITOS", url: `${appUrl()}/admin/registrations?workshopId=${payload.workshopId}` },
        ),
        text: text(`El taller ${payload.workshopName} tiene solamente un lugar disponible.`, pairs),
      };
    }

    case "ADMIN_WORKSHOP_FULL": {
      const pairs: [string, unknown][] = [
        ["Inscritos", payload.registered],
        ["Capacidad", payload.capacity],
        ["Disponibles", 0],
      ];
      return {
        subject: `Taller lleno — ${payload.workshopName}`,
        html: layout(
          "Taller lleno",
          `<p style="font-size:14px">El taller <strong>${esc(payload.workshopName)}</strong> acaba de alcanzar su capacidad máxima.</p>${rows(pairs)}`,
          { label: "VER INSCRITOS", url: `${appUrl()}/admin/registrations?workshopId=${payload.workshopId}` },
        ),
        text: text(`El taller ${payload.workshopName} acaba de alcanzar su capacidad máxima.`, pairs),
      };
    }

    case "ADMIN_CANCELLATION": {
      const { date, time } = formatDateTime(String(payload.at));
      const pairs: [string, unknown][] = [
        ["Estudiante", payload.studentName],
        ["Correo", payload.email],
        ["Taller", payload.workshopName],
        ["Hora", `${date} ${time}`],
        ["Cancelado por", payload.by],
        ["Lugares disponibles", payload.available],
        ["Ocupación", `${payload.registered} / ${payload.capacity}`],
      ];
      return {
        subject: `Cancelación — ${payload.workshopName}`,
        html: layout("Cancelación de inscripción", rows(pairs), {
          label: "VER EN PANEL",
          url: `${appUrl()}/admin/registrations/${payload.registrationId}`,
        }),
        text: text("Cancelación", pairs),
      };
    }
  }
}

export function renderOtpEmail(code: string, minutes: number): RenderedEmail {
  const digits = code
    .split("")
    .map(
      (d) =>
        `<span style="display:inline-block;width:38px;height:46px;line-height:46px;margin:0 3px;border-radius:10px;background:#eff6ff;border:1px solid #bfdbfe;font-size:24px;font-weight:700;color:#0b2a5b">${esc(d)}</span>`,
    )
    .join("");
  return {
    subject: `Tu código de verificación: ${code}`,
    html: layout(
      "Código de verificación",
      `<p style="font-size:14px;line-height:1.6">Usa este código para verificar tu correo institucional. Expira en ${minutes} minutos y solo puede usarse una vez.</p>
<div style="text-align:center;margin:20px 0">${digits}</div>
<p style="font-size:12px;color:#64748b">Si no solicitaste este código, ignora este mensaje.</p>`,
    ),
    text: `Tu código de verificación es ${code}. Expira en ${minutes} minutos.`,
  };
}
