import crypto from "node:crypto";
import { env } from "./env";

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** HMAC con clave derivada por propósito (separación de dominios). */
function derivedKey(purpose: string): Buffer {
  return Buffer.from(crypto.hkdfSync("sha256", env().AUTH_SECRET, "prepa-talleres", purpose, 32));
}

export function hmac(purpose: string, value: string): string {
  return crypto.createHmac("sha256", derivedKey(purpose)).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab); // tiempo constante aproximado
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/** OTP de 6 dígitos con CSPRNG. */
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** El OTP nunca se guarda en texto plano: HMAC(secret, email:code). */
export function hashOtp(email: string, code: string): string {
  return hmac("otp", `${email}:${code}`);
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmac("ip", ip).slice(0, 32);
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I
const ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"; // crockford base32

function randomFrom(alphabet: string, length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]; // 256 % 32 == 0 → sin sesgo
  return out;
}

/** Código legible, ej. PY-CTF-A82X7Q */
export function generateRegistrationCode(prefix: string): string {
  const clean = prefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "TLR";
  return `PY-${clean}-${randomFrom(CODE_ALPHABET, 6)}`;
}

/** ID público no adivinable (~130 bits). */
export function generatePublicId(): string {
  return `reg_${randomFrom(ID_ALPHABET, 26)}`;
}

/* ---------------- Token firmado para QR ---------------- */

/** El QR solo contiene un token opaco firmado. Nunca datos personales. */
export function signQrToken(publicId: string, version: number): string {
  const body = `${publicId}.${version}`;
  return `PYT1.${body}.${hmac("qr", body).slice(0, 32)}`;
}

export function verifyQrToken(token: string): { publicId: string; version: number } | null {
  const m = /^PYT1\.(reg_[0-9a-z]{26})\.(\d{1,6})\.([0-9a-f]{32})$/.exec(token.trim());
  if (!m) return null;
  const [, publicId, versionStr, sig] = m;
  const expected = hmac("qr", `${publicId}.${versionStr}`).slice(0, 32);
  if (!safeEqual(sig, expected)) return null;
  return { publicId, version: Number(versionStr) };
}

/* ---------------- Cifrado simétrico (secretos TOTP) ---------------- */

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey("totp-enc"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1") throw new Error("Formato de secreto desconocido");
  const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey("totp-enc"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** Hash canónico de un cuerpo JSON (para idempotencia). */
export function canonicalHash(body: unknown): string {
  const canon = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canon);
    if (v && typeof v === "object") {
      return Object.keys(v as object)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = canon((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return sha256(JSON.stringify(canon(body)));
}
