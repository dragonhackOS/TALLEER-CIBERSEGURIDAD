"use client";

import * as React from "react";
import Link from "next/link";
import { useCan } from "@/components/admin/admin-context";
import { Loading, PageHeader, useApiData, useRealtime } from "@/components/admin/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDateTime, formatWorkshopDate, pct } from "@/lib/format";

interface A {
  workshops: { id: string; name: string; date: string; startTime: string; endTime: string; location: string; registered: number; checkedIn: number; noShow: number }[];
  recent: { id: string; at: string; method: string; by: string | null; registrationId: string; code: string; studentName: string; workshopName: string }[];
}

export default function AttendancePage() {
  const canBulk = useCan("registrations:write");
  const toast = useToast();
  const { data, loading, reload } = useApiData<A>("/api/admin/attendance");
  const [confirm, setConfirm] = React.useState<A["workshops"][number] | null>(null);
  useRealtime((e) => e.type === "checkin" && void reload());

  async function bulkNoShow() {
    if (!confirm) return;
    try {
      const r = await api<{ count: number }>("/api/admin/attendance", { body: { workshopId: confirm.id } });
      toast({ tone: "success", title: `${r.count} alumno(s) marcados como ausentes` });
      setConfirm(null);
      await reload();
    } catch (err) {
      toast({ tone: "error", title: "Error", description: err instanceof Error ? err.message : undefined });
    }
  }

  if (loading && !data) return <Loading />;
  return (
    <>
      <PageHeader eyebrow="Operación" title="Asistencia" actions={<Link href="/admin/checkin" className={buttonVariants({ size: "sm" })}>Abrir check-in</Link>} />
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.workshops.map((w) => {
          const total = w.registered + w.checkedIn + w.noShow;
          return (
            <div key={w.id} className="card p-5">
              <p className="font-bold text-slate-900">{w.name}</p>
              <p className="text-sm text-slate-500">{formatWorkshopDate(w.date)} · {w.startTime}–{w.endTime} · {w.location}</p>
              <Progress value={pct(w.checkedIn, total)} tone="green" className="mt-4 h-2.5" />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-lg bg-emerald-50 p-2"><p className="text-xl font-bold tabular text-emerald-700">{w.checkedIn}</p><p className="text-xs text-emerald-800">Asistieron</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-xl font-bold tabular">{w.registered}</p><p className="text-xs text-slate-500">Pendientes</p></div>
                <div className="rounded-lg bg-amber-50 p-2"><p className="text-xl font-bold tabular text-amber-700">{w.noShow}</p><p className="text-xs text-amber-800">No asistieron</p></div>
              </div>
              {canBulk && w.registered > 0 && <Button size="sm" variant="ghost" className="mt-3" onClick={() => setConfirm(w)}>Marcar pendientes como ausentes</Button>}
            </div>
          );
        })}
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Últimos check-ins</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-slate-100 text-sm">
            {data?.recent.length === 0 && <li className="py-3 text-slate-500">Sin registros todavía.</li>}
            {data?.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/admin/registrations/${r.registrationId}`} className="font-semibold text-slate-900 hover:underline">{r.studentName}</Link>
                <span className="text-slate-500">{r.workshopName} · <span className="font-mono text-xs">{r.code}</span> · {formatDateTime(r.at).time} · {r.method}{r.by ? ` · ${r.by}` : ""}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title="Marcar ausentes" description={`Todos los inscritos sin check-in de "${confirm?.name}" pasarán a NO_SHOW.`}>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setConfirm(null)}>Cancelar</Button><Button onClick={bulkNoShow}>Confirmar</Button></div>
      </Dialog>
    </>
  );
}
