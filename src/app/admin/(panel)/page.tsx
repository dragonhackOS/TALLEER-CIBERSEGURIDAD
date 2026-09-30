"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, BookOpen, CalendarPlus, ClipboardCheck, Gauge, ListOrdered, Lock, UserCheck, Users } from "lucide-react";
import { useAdmin } from "@/components/admin/admin-context";
import { SimpleBar, SimpleLine } from "@/components/admin/charts";
import { LiveIndicator, Loading, PageHeader, StatCard, useApiData, useRealtime } from "@/components/admin/ui";
import { PublicStatusBadge } from "@/components/public/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import type { PublicStatus } from "@/lib/workshop-status";

interface Dashboard {
  cards: { totalRegistered: number; totalCapacity: number; available: number; occupancy: number; openWorkshops: number; fullWorkshops: number; registrationsToday: number; checkins: number; waitlist: number };
  workshops: { id: string; name: string; registered: number; capacity: number; available: number; held: number; waitlist: number; checkins: number; publicStatus: PublicStatus; status: string; occupancy: number }[];
  charts: { byDay: { day: string; n: number }[]; byHour: { hour: number; n: number }[]; bySemester: { semester: string; n: number }[] };
  nearlyFull: { id: string; name: string; registered: number; capacity: number }[];
  recent: { id: string; at: string; code: string; studentName: string | null; workshopName: string; source: string }[];
}

type FeedItem = { key: string; name: string; workshop: string; at: string; kind: string };

export default function DashboardPage() {
  const admin = useAdmin();
  const toast = useToast();
  const { data, loading, reload } = useApiData<Dashboard>("/api/admin/dashboard");
  const [feed, setFeed] = React.useState<FeedItem[]>([]);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const connected = useRealtime((e) => {
    if (e.type === "registration.created") {
      const item = { key: String(e.registrationId) + e.at, name: String(e.studentName || "Alumno"), workshop: String(e.workshopName), at: String(e.at), kind: e.source === "WAITLIST" ? "Promovido de lista de espera" : "Nueva inscripción" };
      setFeed((f) => [item, ...f].slice(0, 8));
      toast({ tone: "info", title: item.kind, description: `${item.name} · ${item.workshop}` });
    }
    if (e.type === "registration.cancelled") setFeed((f) => [{ key: String(e.at) + Math.random(), name: "Cancelación", workshop: String(e.workshopName), at: String(e.at), kind: "Cancelación" }, ...f].slice(0, 8));
    // Recarga agrupada para no saturar el servidor en picos de inscripción.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void reload(), 600);
  });

  React.useEffect(() => {
    if (data && feed.length === 0) {
      setFeed(data.recent.map((r) => ({ key: r.id, name: r.studentName ?? "Alumno", workshop: r.workshopName, at: r.at, kind: r.source === "WAITLIST" ? "Promovido de lista de espera" : "Nueva inscripción" })));
    }
  }, [data, feed.length]);

  if (loading && !data) return <Loading />;
  if (!data) return null;
  const c = data.cards;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Panel de Talleres"
        title={`Hola, ${admin.name.split(" ")[0]}`}
        description={`${c.totalRegistered} estudiante${c.totalRegistered === 1 ? "" : "s"} inscrito${c.totalRegistered === 1 ? "" : "s"} · ${c.available} lugares disponibles · ${c.openWorkshops} talleres abiertos · ${c.fullWorkshops} taller${c.fullWorkshops === 1 ? "" : "es"} lleno${c.fullWorkshops === 1 ? "" : "s"} · ${c.registrationsToday} registro${c.registrationsToday === 1 ? "" : "s"} hoy`}
        actions={<LiveIndicator connected={connected} />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard accent label="Total inscritos" value={c.totalRegistered} hint={`Ocupación: ${c.occupancy}%`} icon={Users} />
        <StatCard label="Capacidad total" value={c.totalCapacity} icon={Gauge} />
        <StatCard label="Lugares disponibles" value={c.available} icon={ClipboardCheck} />
        <StatCard label="Talleres abiertos" value={c.openWorkshops} icon={BookOpen} />
        <StatCard label="Talleres llenos" value={c.fullWorkshops} icon={Lock} />
        <StatCard label="Registros hoy" value={c.registrationsToday} icon={CalendarPlus} />
        <StatCard label="Check-ins" value={c.checkins} icon={UserCheck} />
        <StatCard label="Lista de espera" value={c.waitlist} icon={ListOrdered} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {data.workshops.map((w) => (
          <Link key={w.id} href={`/admin/registrations?workshopId=${w.id}`} className="card block p-5 transition-shadow hover:shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold text-slate-900">{w.name}</p>
              <PublicStatusBadge status={w.publicStatus} />
            </div>
            <Progress value={w.occupancy} className="mt-4 h-2.5" />
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-2xl font-extrabold tabular">{w.registered} <span className="text-base font-semibold text-slate-400">/ {w.capacity}</span></p>
              <p className="text-sm font-semibold tabular text-slate-600">{w.occupancy}%</p>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {w.available} lugar{w.available === 1 ? "" : "es"} disponible{w.available === 1 ? "" : "s"}
              {w.held > 0 && ` · ${w.held} reservado${w.held === 1 ? "" : "s"}`}
              {w.waitlist > 0 && ` · ${w.waitlist} en espera`}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Registros por día</CardTitle><CardDescription>Últimos 14 días</CardDescription></CardHeader>
          <CardContent><SimpleLine data={data.charts.byDay.map((d) => ({ ...d, label: d.day.slice(5).split("-").reverse().join("/") }))} x="label" y="n" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Actividad en vivo</CardTitle><CardDescription>Se actualiza sin recargar</CardDescription></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {feed.length === 0 && <li className="text-sm text-slate-500">Sin actividad reciente.</li>}
              {feed.map((f) => (
                <li key={f.key} className="flex animate-fade-in items-start gap-3">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${f.kind === "Cancelación" ? "bg-slate-400" : "bg-brand-600"}`} />
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-slate-900">{f.kind}</p>
                    <p className="truncate text-slate-600">{f.name !== "Cancelación" && `${f.name} · `}{f.workshop}</p>
                    <p className="text-xs tabular text-slate-400">{formatDateTime(f.at).time}</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Inscripciones por taller</CardTitle></CardHeader>
          <CardContent><SimpleBar horizontal data={data.workshops} x="name" y="registered" height={Math.max(160, data.workshops.length * 44)} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Registros por hora</CardTitle><CardDescription>Hora local de Mérida</CardDescription></CardHeader>
          <CardContent><SimpleBar data={data.charts.byHour.map((h) => ({ ...h, label: `${h.hour}h` }))} x="label" y="n" label="Registros" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Distribución por semestre</CardTitle></CardHeader>
          <CardContent><SimpleBar data={data.charts.bySemester} x="semester" y="n" label="Alumnos" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Porcentaje de ocupación</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {data.workshops.map((w) => (
              <div key={w.id}>
                <div className="mb-1.5 flex justify-between text-sm"><span className="truncate font-medium text-slate-700">{w.name}</span><span className="font-semibold tabular">{w.occupancy}%</span></div>
                <Progress value={w.occupancy} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Próximos a llenarse</CardTitle><CardDescription>Ocupación ≥ 70%</CardDescription></CardHeader>
          <CardContent>
            {data.nearlyFull.length === 0 ? <p className="text-sm text-slate-500">Ningún taller está cerca de su límite.</p> : (
              <ul className="divide-y divide-slate-100">
                {data.nearlyFull.map((w) => (
                  <li key={w.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium text-slate-800">{w.name}</span>
                    <span className="tabular text-slate-600">{w.registered} / {w.capacity} · <span className="font-semibold text-amber-700">quedan {w.capacity - w.registered}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
