"use client";

/** Cliente HTTP del navegador: CSRF double-submit + manejo uniforme de errores. */
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)(?:__Host-)?py_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json", ...(opts.headers ?? {}) };
  if (method !== "GET") {
    headers["X-CSRF-Token"] = csrfToken();
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  }
  const res = await fetch(path, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
    signal: opts.signal,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; message?: string; details?: Record<string, unknown> };
    throw new ApiError(d.error ?? "HTTP_ERROR", res.status, d.message ?? "Ocurrió un error. Inténtalo de nuevo.", d.details);
  }
  return data as T;
}

export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.details && typeof err.details.fields === "object") {
    return err.details.fields as Record<string, string>;
  }
  return {};
}
