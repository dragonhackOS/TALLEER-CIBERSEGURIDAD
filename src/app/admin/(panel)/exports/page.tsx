"use client";

import * as React from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { PageHeader, useApiData } from "@/components/admin/ui";
import { buttonVariants } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SCOPES = [
  ["all", "Todas las inscripciones"],
  ["workshop", "Por taller"],
  ["date", "Por fecha de registro"],
  ["status", "Por estado"],
  ["attended", "Solo asistentes"],
  ["waitlist", "Solo lista de espera"],
] as const;

export default function ExportsPage() {
  const { data: ws } = useApiData<{ workshops: { id: string; name: string }[] }>("/api/admin/workshops");
  const [scope, setScope] = React.useState<string>("all");
  const [workshopId, setWorkshopId] = React.useState("");
  const [date, setDate] = React.useState("");
  const [status, setStatus] = React.useState("REGISTERED");
  const [format, setFormat] = React.useState<"csv" | "xlsx">("xlsx");

  const params = new URLSearchParams({ format, scope });
  if (workshopId && (scope === "workshop" || scope === "waitlist" || scope === "attended")) params.set("workshopId", workshopId);
  if (scope === "date" && date) params.set("date", date);
  if (scope === "status") params.set("status", status);
  const ready = !(scope === "workshop" && !workshopId) && !(scope === "date" && !date);

  return (
    <>
      <PageHeader eyebrow="Datos" title="Exportaciones" description="Descargas en CSV o Excel. Cada exportación queda registrada en auditoría." />
      <div className="card max-w-2xl space-y-6 p-6">
        <div>
          <Label>Qué exportar</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {SCOPES.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setScope(k)} className={cn("rounded-xl border px-4 py-3 text-left text-sm font-medium transition", scope === k ? "border-brand-600 bg-brand-50 text-brand-900 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300")}>{l}</button>
            ))}
          </div>
        </div>
        {(scope === "workshop" || scope === "attended" || scope === "waitlist") && (
          <div><Label htmlFor="w" optional={scope !== "workshop"}>Taller</Label><Select id="w" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}><option value="">{scope === "workshop" ? "Selecciona…" : "Todos"}</option>{ws?.workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></div>
        )}
        {scope === "date" && <div><Label htmlFor="d">Fecha</Label><Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
        {scope === "status" && (
          <div><Label htmlFor="s">Estado</Label><Select id="s" value={status} onChange={(e) => setStatus(e.target.value)}><option value="REGISTERED">Inscrito</option><option value="CHECKED_IN">Asistió</option><option value="NO_SHOW">No asistió</option><option value="CANCELLED">Cancelada</option></Select></div>
        )}
        <div>
          <Label>Formato</Label>
          <div className="flex gap-2">
            {(["xlsx", "csv"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFormat(f)} className={cn("flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold", format === f ? "border-brand-600 bg-brand-50 text-brand-900" : "border-slate-200")}>
                {f === "xlsx" ? <FileSpreadsheet className="h-4 w-4" /> : <FileText className="h-4 w-4" />} {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <a aria-disabled={!ready} href={ready ? `/api/admin/exports?${params}` : undefined} className={cn(buttonVariants({ size: "lg" }), !ready && "pointer-events-none opacity-50")}>
          <Download className="h-4 w-4" /> Descargar
        </a>
        <p className="text-xs text-slate-500">Columnas: Nombre, Correo, Salón, Semestre, Taller, Estado, Código, Fecha, Hora, Asistencia.</p>
      </div>
    </>
  );
}
