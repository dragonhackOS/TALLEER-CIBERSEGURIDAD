import { isSecureContext } from "@/lib/env";

/**
 * Nombres de cookies. En HTTPS se usa el prefijo __Host- (obliga Secure,
 * Path=/ y sin Domain), que impide la inyección desde subdominios.
 */
export function cookieName(base: "st" | "adm" | "csrf"): string {
  const name = `py_${base}`;
  return isSecureContext() ? `__Host-${name}` : name;
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
