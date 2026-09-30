"use client";

import * as React from "react";
import { api } from "@/lib/api-client";

/**
 * Control de inactividad del formulario. El servidor es la autoridad
 * (expiresAt); el cliente solo avisa 1 minuto antes y permite renovar.
 */
export function useSessionTimeout(initialExpiresAt: string | null, onExpired: () => void) {
  const [expiresAt, setExpiresAt] = React.useState<number | null>(initialExpiresAt ? Date.parse(initialExpiresAt) : null);
  const [now, setNow] = React.useState(() => Date.now());
  const lastPing = React.useRef(Date.now());
  const expiredRef = React.useRef(false);

  React.useEffect(() => {
    setExpiresAt(initialExpiresAt ? Date.parse(initialExpiresAt) : null);
    expiredRef.current = false;
  }, [initialExpiresAt]);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const keepAlive = React.useCallback(async () => {
    try {
      const r = await api<{ expiresAt: string; serverTime: string }>("/api/session/keepalive", { method: "POST" });
      const skew = Date.now() - Date.parse(r.serverTime);
      setExpiresAt(Date.parse(r.expiresAt) + skew);
      lastPing.current = Date.now();
      return true;
    } catch {
      return false;
    }
  }, []);

  // Actividad del usuario → renovar como máximo una vez por minuto.
  React.useEffect(() => {
    if (!expiresAt) return;
    const onActivity = () => {
      if (Date.now() - lastPing.current > 60_000 && expiresAt - Date.now() > 60_000) void keepAlive();
    };
    window.addEventListener("keydown", onActivity);
    window.addEventListener("pointerdown", onActivity);
    return () => {
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("pointerdown", onActivity);
    };
  }, [expiresAt, keepAlive]);

  const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : null;

  React.useEffect(() => {
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      void api("/api/session", { method: "DELETE" }).catch(() => undefined);
      onExpired();
    }
  }, [remaining, onExpired]);

  return { remaining, warning: remaining !== null && remaining > 0 && remaining <= 60, keepAlive, setExpiresAt };
}

export function mmss(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
