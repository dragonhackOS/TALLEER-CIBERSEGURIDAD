"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, Copy, DoorClosed, DoorOpen, Pencil, Plus, Users, XCircle, Flag } from "lucide-react";
import { useCan } from "@/components/admin/admin-context";
import { Loading, PageHeader, useApiData, WorkshopStatusBadge } from "@/components/admin/ui";
import { PublicStatusBadge } from "@/components/public/status-badge";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatWorkshopDate, pct } from "@/lib/format";
import type { PublicStatus } from "@/lib/workshop-status";

interface AW {
  id: string; name: string; slug: string; date: string; startTime: string; endTime: string; location: string; instructor: string; maxCapacity: number; registered: number;
  available: number; held: number; waitlist: number; checkins: number; publicStatus: PublicStatus; status: string; archived: boolean;
}

export default function WorkshopsPage() {
  const canWrite = useCan("workshops:write");
  const toast = useToast();
  const { data, loading, reload } = useApiData<{ workshops: AW[] }>("/api/admin/workshops");
  const [showArchived, setShowArchived] = React.useState(false);
  const [capacity, setCapacity] = React.useState<AW | null>(null);
  const [newCap, setNewCap] = React.useState("");
  const [capError, setCapError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{ w: AW; action: string; label: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function runAction(w: AW, action: string) {
    setBusy(true);
    try {
      await api(`/api/admin/workshops/${w.id}/actions`, { body: { action } });
      toast({ tone: "success", title: "Acción aplicada", description: w.name });
      setConfirm(null);
      await reload();
    } catch (err) {
      toast({ tone: "error", title: "No se pudo aplicar", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function saveCapacity() {
    if (!capacity) return;
    setBusy(true);
    setCapError(null);
    try {
      const r = await api<{ promoted: number }>(`/api/admin/workshops/${capacity.id}/capacity`, { method: "PUT", body: { maxCapacity: Number(newCap) } });
      toast({ tone: "success", title: "Capacidad actualizada", description: r.promoted ? `${r.promoted} alumno(s) promovidos de la lista de espera.` : undefined });
      setCapacity(null);
      await reload();
    } catch (err) {
      setCapError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const list = (data?.workshops ?? []).filter((w) => showArchived || !w.archived);

  return (
    <>
      <PageHeader
        eyebrow="Gestión"
        title="Talleres"
        description="Crea, edita y controla el estado y la capacidad de cada taller."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowArchived((s) => !s)}>{showArchived ? "Ocultar archivados" : "Ver archivados"}</Button>
            {canWrite && <Link href="/admin/workshops/new" className={buttonVariants({ size: "sm" })}><Plus className="h-4 w-4" /> Nuevo taller</Link>}
          </>
        }
      />
      {loading && !data ? <Loading /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((w) => {
            const occ = pct(w.registered, w.maxCapacity);
            return (
              <div key={w.id} className={`card p-5 ${w.archived ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-900">{w.name}</p>
                    <p className="text-sm text-slate-500">{formatWorkshopDate(w.date, true)} · {w.startTime}–{w.endTime} · {w.location}</p>
                  </div>
                  <div className="flex gap-1.5"><WorkshopStatusBadge status={w.status} /><PublicStatusBadge status={w.publicStatus} /></div>
                </div>
                <div className="mt-4 flex items-center gap-4">
                  <Progress value={occ} className="h-2.5" />
                  <span className="shrink-0 text-sm font-semibold tabular">{w.registered} / {w.maxCapacity}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{w.available} disponibles · {w.held} reservados · {w.waitlist} en espera · {w.checkins} check-ins</p>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-4">
                  <Link href={`/admin/registrations?workshopId=${w.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}><Users className="h-3.5 w-3.5" /> Inscritos</Link>
                  <Link href={`/admin/workshops/${w.id}`} className={buttonVariants({ size: "sm", variant: "secondary" })}><Pencil className="h-3.5 w-3.5" /> {canWrite ? "Editar" : "Ver"}</Link>
                  {canWrite && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => { setCapacity(w); setNewCap(String(w.maxCapacity)); setCapError(null); }}>Capacidad</Button>
                      {["DRAFT", "CLOSED"].includes(w.status) && <Button size="sm" variant="subtle" onClick={() => runAction(w, "open")}><DoorOpen className="h-3.5 w-3.5" /> Abrir</Button>}
                      {["OPEN", "FULL"].includes(w.status) && <Button size="sm" variant="secondary" onClick={() => setConfirm({ w, action: "close", label: "Cerrar inscripciones" })}><DoorClosed className="h-3.5 w-3.5" /> Cerrar</Button>}
                      {!["FINISHED", "CANCELLED"].includes(w.status) && <Button size="sm" variant="ghost" onClick={() => setConfirm({ w, action: "finish", label: "Marcar como finalizado" })}><Flag className="h-3.5 w-3.5" /> Finalizar</Button>}
                      <Button size="sm" variant="ghost" onClick={() => runAction(w, "duplicate")}><Copy className="h-3.5 w-3.5" /> Duplicar</Button>
                      <Button size="sm" variant="ghost" onClick={() => runAction(w, w.archived ? "unarchive" : "archive")}><Archive className="h-3.5 w-3.5" /> {w.archived ? "Restaurar" : "Archivar"}</Button>
                      {w.status !== "CANCELLED" && <Button size="sm" variant="danger-outline" onClick={() => setConfirm({ w, action: "cancel", label: "Cancelar taller" })}><XCircle className="h-3.5 w-3.5" /> Cancelar</Button>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {list.length === 0 && <div className="card p-10 text-center text-sm text-slate-500 lg:col-span-2">No hay talleres.</div>}
        </div>
      )}

      <Dialog open={!!capacity} onClose={() => setCapacity(null)} title="Modificar capacidad" description={capacity ? `${capacity.name} · ${capacity.registered} inscritos actualmente` : ""}>
        <Label htmlFor="newcap">Nueva capacidad máxima</Label>
        <Input id="newcap" type="number" min={1} value={newCap} onChange={(e) => setNewCap(e.target.value)} invalid={!!capError} />
        <FieldError>{capError}</FieldError>
        <p className="mt-2 text-xs text-slate-500">Si aumentas la capacidad, se promoverá automáticamente a la lista de espera.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCapacity(null)}>Cancelar</Button>
          <Button loading={busy} onClick={saveCapacity}>Guardar</Button>
        </div>
      </Dialog>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.label ?? ""} description={confirm?.w.name}>
        {confirm?.action === "cancel" && <Alert tone="warning">Se liberarán las reservas activas. Las inscripciones existentes se conservan para que puedas notificarlas.</Alert>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Volver</Button>
          <Button variant={confirm?.action === "cancel" ? "danger" : "primary"} loading={busy} onClick={() => confirm && runAction(confirm.w, confirm.action)}>Confirmar</Button>
        </div>
      </Dialog>
    </>
  );
}
