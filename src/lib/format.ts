/** Utilidades de formato compartidas (cliente y servidor). Zona: America/Merida. */
export const TZ = "America/Merida";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Fechas de taller se guardan como DATE (UTC medianoche) → formatear en UTC. */
export function formatWorkshopDate(date: string | Date, withYear = false): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];
  return withYear ? `${day} de ${month} de ${d.getUTCFullYear()}` : `${day} de ${month}`;
}

export function isoDateOnly(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export function formatDateTime(date: string | Date): { date: string; time: string } {
  const d = typeof date === "string" ? new Date(date) : date;
  const dateStr = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const timeStr = new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date: dateStr, time: timeStr };
}

export function formatDateTimeLong(date: string | Date): string {
  const { date: d, time } = formatDateTime(date);
  return `${d} ${time}`;
}

export const LEVEL_LABEL: Record<string, string> = {
  PRINCIPIANTE: "Principiante",
  INTERMEDIO: "Intermedio",
  AVANZADO: "Avanzado",
};

export const REGISTRATION_STATUS_LABEL: Record<string, string> = {
  REGISTERED: "Inscrito",
  CHECKED_IN: "Asistió",
  NO_SHOW: "No asistió",
  CANCELLED: "Cancelada",
  WAITLISTED: "En espera",
};

export const WORKSHOP_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  OPEN: "Abierto",
  FULL: "Lleno",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
  FINISHED: "Finalizado",
};

export const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN: "Administrador",
  INSTRUCTOR: "Instructor",
  CHECKIN_STAFF: "Staff de asistencia",
  VIEWER: "Solo lectura",
};

export function pct(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 100);
}
