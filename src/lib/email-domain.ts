/**
 * Validación estricta de correo institucional. Se comparte entre cliente y
 * servidor, pero la validación del servidor es SIEMPRE la definitiva.
 *
 * Reglas:
 *  - exactamente un "@"
 *  - el dominio debe ser EXACTAMENTE el permitido (sin subdominios ni sufijos)
 *  - parte local: letras, dígitos, ".", "_" y "-"; sin puntos al inicio/fin ni dobles
 *  - NO se permite "+" (evita alias que burlen la regla de un registro por alumno)
 */
const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

export function normalizeEmail(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export function isInstitutionalEmail(raw: string, allowedDomain: string): boolean {
  if (typeof raw !== "string") return false;
  const email = normalizeEmail(raw);
  const domain = allowedDomain.trim().toLowerCase();
  if (email.length < 3 || email.length > 254) return false;
  // Solo ASCII imprimible: evita homógrafos Unicode.
  if (!/^[\x21-\x7e]+$/.test(email)) return false;
  const parts = email.split("@");
  if (parts.length !== 2) return false;
  const [local, host] = parts;
  if (host !== domain) return false;
  if (!LOCAL_PART.test(local)) return false;
  if (local.includes("..")) return false;
  return true;
}
