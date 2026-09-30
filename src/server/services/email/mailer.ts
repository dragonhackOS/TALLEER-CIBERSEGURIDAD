import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { RenderedEmail } from "./templates";

const g = globalThis as unknown as { __mailer?: Transporter; __mailerMode?: "smtp" | "log" };

/**
 * Transporte SMTP configurable. Si SMTP_HOST está vacío (desarrollo) los
 * correos se registran en el log sin contenido sensible.
 */
function transporter(): Transporter {
  if (g.__mailer) return g.__mailer;
  const e = env();
  if (e.SMTP_HOST) {
    g.__mailer = nodemailer.createTransport({
      host: e.SMTP_HOST,
      port: e.SMTP_PORT,
      secure: e.SMTP_SECURE,
      auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
      pool: true,
      maxConnections: 3,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      requireTLS: e.NODE_ENV === "production" && !e.SMTP_SECURE && e.SMTP_PORT === 587,
    });
    g.__mailerMode = "smtp";
  } else {
    g.__mailer = nodemailer.createTransport({ jsonTransport: true });
    g.__mailerMode = "log";
  }
  return g.__mailer;
}

export async function sendMail(to: string[], email: RenderedEmail): Promise<void> {
  const t = transporter();
  await t.sendMail({
    from: env().EMAIL_FROM,
    to: to.join(", "),
    subject: email.subject,
    html: email.html,
    text: email.text,
    attachments: email.attachments,
  });
  if (g.__mailerMode === "log") {
    logger.info("email_logged_no_smtp", { recipients: to.length, subject: email.subject.replace(/\d{6}/g, "******") });
  }
}
