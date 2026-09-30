import { redis } from "@/lib/redis";
import { sha256 } from "@/lib/crypto";
import { Errors } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Rate limiting con ventana deslizante (sorted set en Redis, operación atómica en Lua).
 * Los identificadores (correos, IPs) se guardan hasheados.
 */
const SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = window
  if oldest[2] then retry = (tonumber(oldest[2]) + window) - now end
  return {0, count, retry}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, count + 1, 0}
`;

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
  /** Si Redis no responde: true = rechazar (endpoints de autenticación), false = permitir. */
  failClosed?: boolean;
}

export const RULES = {
  otpRequestEmail: { name: "otp_req_email", limit: 3, windowSeconds: 15 * 60, failClosed: true },
  otpRequestIp: { name: "otp_req_ip", limit: 20, windowSeconds: 15 * 60, failClosed: true },
  otpVerify: { name: "otp_verify", limit: 5, windowSeconds: 15 * 60, failClosed: true },
  formIp: { name: "form_ip", limit: 5, windowSeconds: 10 * 60 },
  registrationStudent: { name: "reg_student", limit: 5, windowSeconds: 10 * 60 },
  reservationStudent: { name: "res_student", limit: 15, windowSeconds: 10 * 60 },
  adminLogin: { name: "admin_login", limit: 5, windowSeconds: 15 * 60, failClosed: true },
  adminLoginIp: { name: "admin_login_ip", limit: 20, windowSeconds: 15 * 60, failClosed: true },
  publicApi: { name: "public_api", limit: 60, windowSeconds: 60 },
  adminApi: { name: "admin_api", limit: 600, windowSeconds: 60 },
} satisfies Record<string, RateLimitRule>;

export async function checkRateLimit(rule: RateLimitRule, identifier: string): Promise<void> {
  const key = `rl:${rule.name}:${sha256(identifier).slice(0, 32)}`;
  const now = Date.now();
  try {
    const res = (await redis().eval(
      SLIDING_WINDOW,
      1,
      key,
      String(now),
      String(rule.windowSeconds * 1000),
      String(rule.limit),
      `${now}-${Math.random().toString(36).slice(2, 10)}`,
    )) as [number, number, number];
    if (res[0] === 0) {
      await bumpSuspicion(identifier).catch(() => undefined);
      throw Errors.rateLimited(res[2] / 1000);
    }
  } catch (err) {
    if ((err as { code?: string }).code === "RATE_LIMITED") throw err;
    logger.error("rate_limit_backend_error", { rule: rule.name, message: (err as Error).message });
    if (rule.failClosed) throw Errors.rateLimited(30);
  }
}

/** Reinicia un contador (p. ej. tras login exitoso). */
export async function resetRateLimit(rule: RateLimitRule, identifier: string) {
  try {
    await redis().del(`rl:${rule.name}:${sha256(identifier).slice(0, 32)}`);
  } catch {
    /* noop */
  }
}

/* ------------ Puntaje de sospecha (activa Turnstile dinámicamente) ------------ */

export async function bumpSuspicion(identifier: string, weight = 1) {
  const key = `susp:${sha256(identifier).slice(0, 32)}`;
  const r = redis();
  const v = await r.incrby(key, weight);
  if (v === weight) await r.expire(key, 60 * 60);
}

export async function suspicionScore(identifier: string): Promise<number> {
  try {
    const v = await redis().get(`susp:${sha256(identifier).slice(0, 32)}`);
    return v ? Number(v) : 0;
  } catch {
    return 0;
  }
}
