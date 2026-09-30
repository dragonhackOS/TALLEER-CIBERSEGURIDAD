import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { generateOtp, hashIp, hashOtp, safeEqual } from "@/lib/crypto";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { isInstitutionalEmail, normalizeEmail } from "@/lib/email-domain";
import { checkRateLimit, RULES, bumpSuspicion } from "@/server/rate-limit";
import { sendMail } from "./email/mailer";
import { renderOtpEmail } from "./email/templates";

/**
 * Verificación de correo por OTP.
 * - 6 dígitos con CSPRNG · expira en OTP_EXPIRATION_MINUTES · un solo uso
 * - máximo OTP_MAX_ATTEMPTS intentos por código
 * - se guarda como HMAC-SHA256 con secreto del servidor (nunca en texto plano)
 * - rate limit: 3 códigos / 15 min por correo, 5 verificaciones / 15 min
 */
export async function requestOtp(rawEmail: string, ip: string): Promise<{ expiresInSeconds: number }> {
  const email = normalizeEmail(rawEmail);
  // Validación definitiva en el backend.
  if (!isInstitutionalEmail(email, env().ALLOWED_EMAIL_DOMAIN)) throw Errors.invalidEmailDomain(env().ALLOWED_EMAIL_DOMAIN);

  await checkRateLimit(RULES.otpRequestIp, ip);
  await checkRateLimit(RULES.otpRequestEmail, email);

  const code = generateOtp();
  const minutes = env().OTP_EXPIRATION_MINUTES;
  const expiresAt = new Date(Date.now() + minutes * 60_000);

  // Invalida códigos anteriores no usados del mismo correo.
  await db().emailVerification.updateMany({
    where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  const record = await db().emailVerification.create({
    data: {
      email,
      codeHash: hashOtp(email, code),
      expiresAt,
      maxAttempts: env().OTP_MAX_ATTEMPTS,
      ipHash: hashIp(ip),
    },
  });

  try {
    await sendMail([email], renderOtpEmail(code, minutes));
    await db().emailLog.create({
      data: { toAddresses: [email], subject: "Código de verificación", template: "OTP", status: "SENT", sentAt: new Date(), relatedType: "email_verification", relatedId: record.id },
    });
  } catch (err) {
    logger.error("otp_send_failed", { verificationId: record.id, message: (err as Error).message });
    await db().emailVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    throw Errors.conflict("EMAIL_SEND_FAILED", "No pudimos enviar el código. Inténtalo en unos minutos.");
  }
  return { expiresInSeconds: minutes * 60 };
}

export async function verifyOtp(rawEmail: string, code: string, ip: string): Promise<{ studentId: string; email: string }> {
  const email = normalizeEmail(rawEmail);
  if (!isInstitutionalEmail(email, env().ALLOWED_EMAIL_DOMAIN)) throw Errors.invalidEmailDomain(env().ALLOWED_EMAIL_DOMAIN);
  await checkRateLimit(RULES.otpVerify, email);

  const record = await db().emailVerification.findFirst({
    where: { email, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!record || record.expiresAt <= new Date()) {
    await bumpSuspicion(ip).catch(() => undefined);
    throw Errors.otpInvalid();
  }

  // Incremento atómico de intentos ANTES de comparar (evita carreras de fuerza bruta).
  const claimed = await db().$queryRaw<{ attempts: number }[]>`
    UPDATE email_verifications SET attempts = attempts + 1
     WHERE id = ${record.id}::uuid AND consumed_at IS NULL AND attempts < max_attempts
     RETURNING attempts`;
  if (claimed.length === 0) throw Errors.otpLocked();

  if (!safeEqual(record.codeHash, hashOtp(email, code))) {
    await bumpSuspicion(ip).catch(() => undefined);
    if (Number(claimed[0].attempts) >= record.maxAttempts) {
      await db().emailVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
      throw Errors.otpLocked();
    }
    throw Errors.otpInvalid();
  }

  // Un solo uso: consumo condicionado.
  const consumed = await db().emailVerification.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count !== 1) throw Errors.otpInvalid();

  const student = await db().student.upsert({
    where: { email },
    update: { emailVerifiedAt: new Date() },
    create: { email, emailVerifiedAt: new Date() },
  });
  return { studentId: student.id, email };
}
