import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware de seguridad (runtime Node.js):
 *  - Content Security Policy con nonce por solicitud
 *  - Protección CSRF: verificación de Origin + token double-submit
 *  - CORS restrictivo (sin orígenes externos)
 *  - Redirección a /admin/login si no hay cookie de sesión (la validación
 *    real de la sesión y permisos ocurre SIEMPRE en el servidor)
 */
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|fonts/).*)"],
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_EXEMPT = new Set(["/api/health"]);

function isSecure() {
  return (process.env.APP_URL ?? "").startsWith("https://");
}
function cookieName(base: string) {
  return isSecure() ? `__Host-py_${base}` : `py_${base}`;
}

function allowedOrigins(req: NextRequest): Set<string> {
  const set = new Set<string>();
  try {
    if (process.env.APP_URL) set.add(new URL(process.env.APP_URL).origin);
  } catch {
    /* noop */
  }
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  if (host) set.add(`${proto}://${host}`);
  return set;
}

function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  const turnstile = "https://challenges.cloudflare.com";
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${turnstile}${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self' ${turnstile}${dev ? " ws: wss:" : ""}`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `frame-src ${turnstile}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(isSecure() ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function securityHeaders(res: NextResponse, csp?: string) {
  if (csp) res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  if (isSecure()) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return res;
}

function reject(status: number, error: string, message: string) {
  return securityHeaders(NextResponse.json({ error, message }, { status, headers: { "Cache-Control": "no-store" } }));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi) {
    const origin = req.headers.get("origin");
    // CORS restrictivo: preflights de otros orígenes se rechazan.
    if (req.method === "OPTIONS") {
      if (origin && !allowedOrigins(req).has(origin)) return reject(403, "CORS_FORBIDDEN", "Origen no permitido.");
      return securityHeaders(new NextResponse(null, { status: 204 }));
    }
    if (!SAFE_METHODS.has(req.method) && !CSRF_EXEMPT.has(pathname)) {
      const referer = req.headers.get("referer");
      let source = origin;
      if (!source && referer) {
        try {
          source = new URL(referer).origin;
        } catch {
          source = null;
        }
      }
      if (!source || !allowedOrigins(req).has(source)) return reject(403, "CSRF_FAILED", "Solicitud no permitida.");
      const cookie = req.cookies.get(cookieName("csrf"))?.value;
      const header = req.headers.get("x-csrf-token");
      if (!cookie || !header || cookie !== header || cookie.length < 20) return reject(403, "CSRF_FAILED", "Sesión de seguridad inválida. Recarga la página.");
    }
    return securityHeaders(NextResponse.next());
  }

  // ---------- Páginas ----------
  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && !req.cookies.get(cookieName("adm"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = pathname !== "/admin" ? `?next=${encodeURIComponent(pathname)}` : "";
    return securityHeaders(NextResponse.redirect(url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  securityHeaders(res, csp);
  res.headers.set("Cache-Control", "private, no-store");

  if (!req.cookies.get(cookieName("csrf"))) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Buffer.from(bytes).toString("base64url");
    // Legible por JS (double-submit), pero SameSite=Strict.
    res.cookies.set(cookieName("csrf"), token, { httpOnly: false, secure: isSecure(), sameSite: "strict", path: "/" });
  }
  return res;
}
