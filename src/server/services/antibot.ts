import { env } from "@/lib/env";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { bumpSuspicion, suspicionScore } from "@/server/rate-limit";

/**
 * Protección anti-bot en capas:
 *  1. Honeypot invisible (website_url)
 *  2. Detección de envío demasiado rápido
 *  3. Puntaje de sospecha por IP (fallos OTP, rate limits, honeypot)
 *  4. Cloudflare Turnstile activado dinámicamente al superar el umbral
 * Nunca se le explica al cliente qué protección se activó.
 */
const SUSPICION_THRESHOLD = 3;

export async function checkHoneypot(value: string | undefined, ip: string) {
  if (value && value.trim().length > 0) {
    await bumpSuspicion(ip, 5).catch(() => undefined);
    logger.warn("antibot_honeypot", {});
    throw Errors.rejected();
  }
}

export async function checkFillTime(startedAt: Date, ip: string) {
  const min = env().MIN_FORM_FILL_SECONDS * 1000;
  if (Date.now() - startedAt.getTime() < min) {
    await bumpSuspicion(ip, 2).catch(() => undefined);
    logger.warn("antibot_too_fast", {});
    throw Errors.rejected();
  }
}

export function turnstileEnabled(): boolean {
  return Boolean(env().TURNSTILE_SITE_KEY && env().TURNSTILE_SECRET_KEY);
}

/** Si Turnstile está configurado y la IP es sospechosa, exige un token válido. */
export async function requireChallengeIfSuspicious(token: string | undefined, ip: string) {
  if (!turnstileEnabled()) return;
  const mustChallenge = env().TURNSTILE_ALWAYS || (await suspicionScore(ip)) >= SUSPICION_THRESHOLD;
  if (!mustChallenge) return;
  if (!token) throw Errors.challengeRequired(env().TURNSTILE_SITE_KEY);
  const ok = await verifyTurnstile(token, ip);
  if (!ok) throw Errors.challengeRequired(env().TURNSTILE_SITE_KEY);
}

export async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret: env().TURNSTILE_SECRET_KEY, response: token, remoteip: ip });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    logger.error("turnstile_verify_error", { message: (err as Error).message });
    return false;
  }
}
