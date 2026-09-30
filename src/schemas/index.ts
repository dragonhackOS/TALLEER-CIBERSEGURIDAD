import { z } from "zod";
import { isInstitutionalEmail, normalizeEmail } from "@/lib/email-domain";

/**
 * Esquemas Zod. Todos son `.strict()`: cualquier campo no esperado se rechaza
 * (protección contra mass assignment). Nunca se aceptan role, capacity, status
 * ni contadores desde el cliente en endpoints públicos.
 */

export const institutionalEmail = (domain: string) =>
  z
    .string({ required_error: "El correo es obligatorio." })
    .max(254)
    .transform(normalizeEmail)
    .refine((v) => isInstitutionalEmail(v, domain), { message: `Usa tu correo institucional @${domain}.` });

export const uuid = z.string().uuid();

const honeypot = z.string().max(500).optional(); // website_url: debe llegar vacío
const turnstile = z.string().max(4096).optional();

export const requestCodeSchema = (domain: string) =>
  z
    .object({
      email: institutionalEmail(domain),
      website_url: honeypot,
      turnstileToken: turnstile,
    })
    .strict();

export const verifyCodeSchema = (domain: string) =>
  z
    .object({
      email: institutionalEmail(domain),
      code: z.string().regex(/^\d{6}$/, "El código debe tener 6 dígitos."),
    })
    .strict();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

export const EXPERIENCE_OPTIONS = ["NINGUNA", "BASICA", "INTERMEDIA", "AVANZADA"] as const;

/** Datos del alumno (sin email: el correo SIEMPRE proviene de la sesión verificada). */
export const studentProfileSchema = z
  .object({
    fullName: z
      .string({ required_error: "El nombre es obligatorio." })
      .trim()
      .min(5, "Escribe tu nombre completo.")
      .max(120)
      .regex(/^[\p{L}\p{M}' .-]+$/u, "El nombre solo puede contener letras y espacios."),
    classroom: z
      .string({ required_error: "El salón es obligatorio." })
      .trim()
      .min(1, "Indica tu salón.")
      .max(20)
      .regex(/^[\p{L}\p{N} -]+$/u, "Salón inválido."),
    semester: z.coerce.number({ invalid_type_error: "Selecciona tu semestre." }).int().min(1).max(6),
    phone: optionalText(20).refine((v) => !v || /^[0-9 +()-]{7,20}$/.test(v), "Teléfono inválido."),
    programmingExperience: z.enum(EXPERIENCE_OPTIONS).optional(),
    securityExperience: z.enum(EXPERIENCE_OPTIONS).optional(),
    ctfBefore: z.boolean().optional(),
    privacyAccepted: z.literal(true, {
      errorMap: () => ({ message: "Debes aceptar el aviso de privacidad." }),
    }),
  })
  .strict();

export type StudentProfileInput = z.infer<typeof studentProfileSchema>;

export const createReservationSchema = z.object({ workshopId: uuid }).strict();

export const createRegistrationSchema = z
  .object({
    workshopId: uuid,
    reservationId: uuid.optional(),
    profile: studentProfileSchema,
    website_url: honeypot,
    turnstileToken: turnstile,
  })
  .strict();

export const joinWaitlistSchema = z
  .object({
    workshopId: uuid,
    profile: studentProfileSchema,
    website_url: honeypot,
  })
  .strict();

/* ---------------- Admin ---------------- */

export const adminLoginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(256),
    totp: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .strict();

const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM");

export const workshopBaseSchema = z.object({
  name: z.string().trim().min(3).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones."),
  description: z.string().trim().min(10).max(4000),
  instructorName: z.string().trim().min(3).max(120),
  instructorAdminId: uuid.nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato AAAA-MM-DD"),
  startTime: timeHHMM,
  endTime: timeHHMM,
  location: z.string().trim().min(2).max(120),
  level: z.enum(["PRINCIPIANTE", "INTERMEDIO", "AVANZADO"]),
  maxCapacity: z.coerce.number().int().min(1).max(10000),
  imageUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), "Usa una ruta local (/…) o una URL https://")
    .nullable()
    .optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  codePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, "2 a 6 letras o números")
    .optional(),
  eventKey: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional(),
  registrationOpensAt: z.string().datetime({ offset: true }).nullable().optional(),
  registrationClosesAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const createWorkshopSchema = workshopBaseSchema
  .extend({ status: z.enum(["DRAFT", "OPEN", "CLOSED"]).default("DRAFT") })
  .strict()
  .refine((w) => w.endTime > w.startTime, { message: "La hora final debe ser posterior a la de inicio.", path: ["endTime"] });

export const updateWorkshopSchema = workshopBaseSchema.partial().strict();

export const workshopActionSchema = z
  .object({ action: z.enum(["open", "close", "cancel", "archive", "unarchive", "finish", "duplicate"]) })
  .strict();

export const capacitySchema = z.object({ maxCapacity: z.coerce.number().int().min(1).max(10000) }).strict();

export const registrationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(200).optional() }).strict(),
  z.object({ action: z.literal("move"), targetWorkshopId: uuid }).strict(),
  z.object({ action: z.literal("checkin") }).strict(),
  z.object({ action: z.literal("undo_checkin") }).strict(),
  z.object({ action: z.literal("mark_no_show") }).strict(),
  z.object({ action: z.literal("resend_confirmation") }).strict(),
  z.object({ action: z.literal("regenerate_qr") }).strict(),
]);

export const checkinSchema = z
  .object({
    token: z.string().trim().max(200).optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .max(20)
      .optional(),
    registrationId: uuid.optional(),
    workshopId: uuid.optional(),
  })
  .strict()
  .refine((v) => v.token || v.code || v.registrationId, { message: "Proporciona QR, código o inscripción." });

export const createAdminSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    name: z.string().trim().min(2).max(120),
    role: z.enum(["SUPER_ADMIN", "ADMIN", "INSTRUCTOR", "CHECKIN_STAFF", "VIEWER"]),
    password: z.string().min(12, "Mínimo 12 caracteres.").max(256),
  })
  .strict();

export const updateAdminSchema = z
  .object({
    role: z.enum(["SUPER_ADMIN", "ADMIN", "INSTRUCTOR", "CHECKIN_STAFF", "VIEWER"]).optional(),
    active: z.boolean().optional(),
    revokeSessions: z.boolean().optional(),
    password: z.string().min(12).max(256).optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) })
  .strict();

export const settingsSchema = z
  .object({
    schoolName: z.string().trim().min(2).max(80).optional(),
    logoUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), "Ruta local o https://")
      .optional(),
  })
  .strict();

export const listRegistrationsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  workshopId: uuid.optional(),
  semester: z.coerce.number().int().min(1).max(6).optional(),
  status: z.enum(["REGISTERED", "CHECKED_IN", "NO_SHOW", "CANCELLED", "WAITLISTED", "ACTIVE"]).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  attendance: z.enum(["yes", "no"]).optional(),
  sort: z.enum(["createdAt", "name", "workshop", "code"]).default("createdAt"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(20),
});

export const exportQuery = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  scope: z.enum(["all", "workshop", "date", "status", "attended", "waitlist"]).default("all"),
  workshopId: uuid.optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(["REGISTERED", "CHECKED_IN", "NO_SHOW", "CANCELLED"]).optional(),
});

export function zodDetails(err: z.ZodError): Record<string, unknown> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return { fields };
}
