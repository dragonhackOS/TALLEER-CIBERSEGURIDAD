import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { AppError, Errors, isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { zodDetails } from "@/schemas";

export type RouteContext<P = Record<string, string>> = { params: Promise<P> };

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...NO_STORE, ...headers } });
}

export function errorResponse(err: AppError) {
  const body: Record<string, unknown> = { error: err.code, message: err.message };
  if (err.details) body.details = err.details;
  return json(body, err.status, err.headers ?? {});
}

/** Envoltura estándar: captura errores, nunca filtra stack traces al cliente. */
export function route<P = Record<string, string>>(
  fn: (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (isAppError(err)) return errorResponse(err);
      if (err instanceof ZodError) return errorResponse(Errors.validation(zodDetails(err)));
      logger.error("unhandled_route_error", {
        path: req.nextUrl.pathname,
        method: req.method,
        error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
      });
      return errorResponse(Errors.internal());
    }
  };
}

export async function parseJson<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw Errors.badRequest("Content-Type debe ser application/json.");
  const text = await req.text();
  if (text.length > 64 * 1024) throw Errors.badRequest("Solicitud demasiado grande.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw Errors.badRequest("JSON inválido.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw Errors.validation(zodDetails(parsed.error));
  return parsed.data;
}

export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const obj: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((v, k) => {
    if (v !== "") obj[k] = v;
  });
  const parsed = schema.safeParse(obj);
  if (!parsed.success) throw Errors.validation(zodDetails(parsed.error));
  return parsed.data;
}

/** IP del cliente. Solo confía en X-Forwarded-For si TRUST_PROXY=true. */
export function clientIp(req: NextRequest): string {
  if (env().TRUST_PROXY) {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return (req as unknown as { ip?: string }).ip ?? req.headers.get("x-real-ip") ?? "0.0.0.0";
}
