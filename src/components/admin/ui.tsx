"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/api-client";
import { REGISTRATION_STATUS_LABEL, WORKSHOP_STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, accent }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ElementType; accent?: boolean }) {
  return (
    <div className={cn("card p-5", accent && "bg-gradient-to-br from-brand-700 to-navy-900 text-white")}>
      <div className="flex items-center justify-between">
        <p className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]", accent ? "text-blue-100/80" : "text-slate-500")}>{label}</p>
        {Icon && <Icon className={cn("h-4 w-4", accent ? "text-blue-200" : "text-slate-400")} />}
      </div>
      <p className={cn("mt-2 text-3xl font-extrabold tabular tracking-tight", accent ? "text-white" : "text-slate-900")}>{value}</p>
      {hint && <p className={cn("mt-1 text-xs", accent ? "text-blue-100/80" : "text-slate-500")}>{hint}</p>}
    </div>
  );
}

const REG_TONE: Record<string, "blue" | "green" | "amber" | "gray" | "violet"> = { REGISTERED: "blue", CHECKED_IN: "green", NO_SHOW: "amber", CANCELLED: "gray", WAITLISTED: "violet" };
export function RegistrationStatusBadge({ status }: { status: string }) {
  return <Badge tone={REG_TONE[status] ?? "gray"} dot>{REGISTRATION_STATUS_LABEL[status] ?? status}</Badge>;
}

const WS_TONE: Record<string, "green" | "red" | "gray" | "amber" | "blue"> = { OPEN: "green", FULL: "red", CLOSED: "gray", CANCELLED: "amber", FINISHED: "blue", DRAFT: "gray" };
export function WorkshopStatusBadge({ status }: { status: string }) {
  return <Badge tone={WS_TONE[status] ?? "gray"}>{WORKSHOP_STATUS_LABEL[status] ?? status}</Badge>;
}

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
      <span className="tabular">{total} resultado{total === 1 ? "" : "s"}</span>
      <div className="flex items-center gap-2">
        <Button size="icon" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="tabular">{page} / {pages}</span>
        <Button size="icon" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Siguiente"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export function Loading() {
  return <div className="flex items-center justify-center gap-3 py-16 text-slate-500"><Spinner /> Cargando…</div>;
}

/** Hook de datos: GET con recarga manual. */
export function useApiData<T>(url: string | null) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const load = React.useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [url]);
  React.useEffect(() => void load(), [load]);
  return { data, error, loading, reload: load, setData };
}

/** Suscripción SSE al panel en tiempo real (reconexión automática del navegador). */
export function useRealtime(onEvent: (e: Record<string, unknown>) => void) {
  const ref = React.useRef(onEvent);
  ref.current = onEvent;
  const [connected, setConnected] = React.useState(false);
  React.useEffect(() => {
    const es = new EventSource("/api/admin/stream");
    es.addEventListener("ready", () => setConnected(true));
    es.addEventListener("update", (m) => {
      try {
        ref.current(JSON.parse((m as MessageEvent).data));
      } catch {
        /* noop */
      }
    });
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);
  return connected;
}

export function LiveIndicator({ connected }: { connected: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset", connected ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-500 ring-slate-300")}>
      <span className={cn("h-2 w-2 rounded-full", connected ? "animate-pulse-dot bg-emerald-500" : "bg-slate-400")} />
      {connected ? "En vivo" : "Reconectando…"}
    </span>
  );
}
