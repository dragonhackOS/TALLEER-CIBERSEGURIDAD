import Link from "next/link";
import { CalendarDays, Clock, MapPin, User } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatWorkshopDate, LEVEL_LABEL, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PublicStatus } from "@/lib/workshop-status";
import { PublicStatusBadge } from "./status-badge";
import { WorkshopIcon } from "./workshop-icon";

export interface PublicWorkshop {
  id: string;
  slug: string;
  name: string;
  description: string;
  instructor: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  level: string;
  imageUrl: string | null;
  icon: string | null;
  maxCapacity: number;
  registered: number;
  available: number;
  publicStatus: PublicStatus;
  registrationOpensAt: string | null;
  waitlistCount?: number;
}

export function WorkshopCard({ w }: { w: PublicWorkshop }) {
  const occupancy = pct(w.registered, w.maxCapacity);
  const canEnroll = w.publicStatus === "DISPONIBLE" || w.publicStatus === "POCOS_LUGARES";
  const full = w.publicStatus === "CUPO_LLENO";
  return (
    <article className="card group flex flex-col p-5 transition-shadow duration-200 hover:shadow-lift sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <WorkshopIcon icon={w.icon} imageUrl={w.imageUrl} />
        <PublicStatusBadge status={w.publicStatus} />
      </div>
      <h3 className="mt-4 text-lg font-bold tracking-tight text-slate-900">{w.name}</h3>
      <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-slate-600">{w.description}</p>

      <dl className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-600">
        <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-400" /><dd>{formatWorkshopDate(w.date)}</dd></div>
        <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" /><dd className="tabular">{w.startTime} – {w.endTime}</dd></div>
        <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" /><dd>{w.location}</dd></div>
        <div className="flex items-center gap-2"><User className="h-4 w-4 text-slate-400" /><dd>{w.instructor}</dd></div>
      </dl>

      <div className="mt-5 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-100">
        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
          <span>Nivel: <span className="text-slate-800">{LEVEL_LABEL[w.level] ?? w.level}</span></span>
          <span className="tabular">Inscritos <span className="font-semibold text-slate-900">{w.registered} / {w.maxCapacity}</span></span>
        </div>
        <Progress value={occupancy} className="mt-2.5" />
        <p className="mt-2 text-xs text-slate-500">
          {full ? "Sin lugares disponibles" : <>Lugares disponibles: <span className="font-semibold text-slate-900 tabular">{w.available}</span></>}
        </p>
      </div>

      <div className="mt-5 flex flex-1 items-end gap-2">
        <Link href={`/talleres/${w.slug}`} className={cn(buttonVariants({ variant: "secondary" }), "flex-1")}>Detalles</Link>
        {canEnroll && <Link href={`/talleres/${w.slug}/inscribirme`} className={cn(buttonVariants(), "flex-1")}>Inscribirme</Link>}
        {full && <Link href={`/talleres/${w.slug}/inscribirme`} className={cn(buttonVariants({ variant: "subtle" }), "flex-1")}>Lista de espera</Link>}
      </div>
    </article>
  );
}
