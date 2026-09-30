"use client";

import Link from "next/link";
import { Clock, MapPin, User } from "lucide-react";
import { Loading, PageHeader, useApiData, WorkshopStatusBadge } from "@/components/admin/ui";
import { formatWorkshopDate, pct } from "@/lib/format";
import { Progress } from "@/components/ui/progress";

interface W { id: string; name: string; date: string; startTime: string; endTime: string; location: string; instructor: string; registered: number; maxCapacity: number; status: string; archived: boolean }

export default function SchedulePage() {
  const { data, loading } = useApiData<{ workshops: W[] }>("/api/admin/workshops");
  if (loading && !data) return <Loading />;
  const byDate = new Map<string, W[]>();
  for (const w of data?.workshops.filter((x) => !x.archived) ?? []) {
    const k = w.date.slice(0, 10);
    byDate.set(k, [...(byDate.get(k) ?? []), w].sort((a, b) => a.startTime.localeCompare(b.startTime)));
  }
  return (
    <>
      <PageHeader eyebrow="Planeación" title="Horarios" description="Agenda de talleres por día." />
      <div className="space-y-8">
        {[...byDate.entries()].sort().map(([date, list]) => (
          <section key={date}>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">{formatWorkshopDate(date + "T00:00:00Z", true)}</h2>
            <div className="space-y-3">
              {list.map((w) => (
                <Link key={w.id} href={`/admin/workshops/${w.id}`} className="card flex flex-col gap-3 p-4 transition-shadow hover:shadow-lift sm:flex-row sm:items-center">
                  <div className="flex w-32 shrink-0 items-center gap-2 font-mono text-sm font-bold text-navy-900"><Clock className="h-4 w-4 text-brand-600" />{w.startTime}–{w.endTime}</div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900">{w.name}</p>
                    <p className="flex flex-wrap gap-x-4 text-xs text-slate-500"><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{w.location}</span><span className="flex items-center gap-1"><User className="h-3 w-3" />{w.instructor}</span></p>
                  </div>
                  <div className="flex w-48 items-center gap-3"><Progress value={pct(w.registered, w.maxCapacity)} /><span className="text-xs font-semibold tabular">{w.registered}/{w.maxCapacity}</span></div>
                  <WorkshopStatusBadge status={w.status} />
                </Link>
              ))}
            </div>
          </section>
        ))}
        {byDate.size === 0 && <div className="card p-10 text-center text-sm text-slate-500">No hay talleres programados.</div>}
      </div>
    </>
  );
}
