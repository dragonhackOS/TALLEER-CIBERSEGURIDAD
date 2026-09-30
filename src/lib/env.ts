import { z } from "zod";

/**
 * Configuración validada del servidor. Se evalúa de forma perezosa para que
 * `next build` no requiera secretos, pero cualquier ejecución real falla rápido
 * si falta algo crítico.
 */
const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === "boolean" ? v : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es obligatoria"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
  REDIS_URL: z.string().min(1, "REDIS_URL es obligatoria"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET debe tener al menos 32 caracteres"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  ALLOWED_EMAIL_DOMAIN: z
    .string()
    .min(3)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "ALLOWED_EMAIL_DOMAIN inválido")
    .transform((v) => v.toLowerCase())
    .default("prepayucatan.com"),
  ADMIN_NOTIFICATION_EMAILS: z.string().default(""),
  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_SECURE: bool.default(false),
  EMAIL_FROM: z.string().default("Talleres Prepa Yucatán <no-reply@prepayucatan.com>"),
  OTP_EXPIRATION_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  RESERVATION_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
  SESSION_TIMEOUT_MINUTES: z.coerce.number().int().min(2).max(120).default(10),
  ADMIN_SESSION_HOURS: z.coerce.number().int().min(1).max(72).default(8),
  ADMIN_IDLE_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(60),
  REGISTRATION_POLICY: z.enum(["ONE_PER_EVENT", "ONE_PER_WORKSHOP"]).default("ONE_PER_EVENT"),
  MIN_FORM_FILL_SECONDS: z.coerce.number().int().min(0).max(120).default(3),
  TURNSTILE_SITE_KEY: z.string().optional().default(""),
  TURNSTILE_SECRET_KEY: z.string().optional().default(""),
  TURNSTILE_ALWAYS: bool.default(false),
  TRUST_PROXY: bool.default(false),
  TIMEZONE: z.string().default("America/Merida"),
  SCHOOL_NAME: z.string().default("PREPA YUCATÁN"),
  LOGO_URL: z.string().default("/brand/logo.svg"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  EMAIL_DISPATCH_INLINE: bool.default(true),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuración inválida: ${issues}`);
  }
  if (parsed.data.NODE_ENV === "production" && /change-me|dev-only/i.test(parsed.data.AUTH_SECRET)) {
    throw new Error("AUTH_SECRET de desarrollo detectado en producción. Genera uno con: openssl rand -base64 48");
  }
  cached = parsed.data;
  return cached;
}

/** Solo para pruebas. */
export function resetEnvCache() {
  cached = null;
}

export function isSecureContext(): boolean {
  return env().APP_URL.startsWith("https://");
}

/** Lista de destinatarios administrativos validada. Nunca se expone en APIs públicas. */
export function adminNotificationEmails(): string[] {
  const emailSchema = z.string().email();
  return Array.from(
    new Set(
      env()
        .ADMIN_NOTIFICATION_EMAILS.split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.length > 0 && emailSchema.safeParse(e).success),
    ),
  );
}
