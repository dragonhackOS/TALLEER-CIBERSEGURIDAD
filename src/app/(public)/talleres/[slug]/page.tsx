import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, GraduationCap, MapPin, User, Users } from "lucide-react";
import { PublicStatusBadge } from "@/components/public/status-badge";
import { WorkshopIcon } from "@/components/public/workshop-icon";
import { buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatWorkshopDate, LEVEL_LABEL, pct } from "@/lib/format";
import { getPublicWorkshop } from "@/server/services/workshop.service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const w = /^[a-z0-9-]{1,80}$/.test(slug) ? await getPublicWorkshop(slug) : null;
  return { title: w?.name ?? "Taller" };
}

export default async function WorkshopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const w = await getPublicWorkshop(slug);
  if (!w) notFound();
  const canEnroll = w.publicStatus === "DISPONIBLE" || w.publicStatus === "POCOS_LUGARES";
  const full = w.publicStatus === "CUPO_LLENO";

  return (
    <div className="container max-w-4xl py-8 sm:py-12">
      <Link href="/#talleres" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Todos los talleres
      </Link>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <article className="card p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <WorkshopIcon icon={w.icon} imageUrl={w.imageUrl} className="h-14 w-14" />
            <div className="min-w-0">
              <PublicStatusBadge status={w.publicStatus} />
              <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{w.name}</h1>
            </div>
          </div>
          <p className="mt-6 whitespace-pre-line leading-relaxed text-slate-600">{w.description}</p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              { Icon: CalendarDays, k: "Fecha", v: formatWorkshopDate(w.date, true) },
              { Icon: Clock, k: "Horario", v: `${w.startTime} – ${w.endTime}` },
              { Icon: MapPin, k: "Lugar", v: w.location },
              { Icon: User, k: "Instructor", v: w.instructor },
              { Icon: GraduationCap, k: "Nivel", v: LEVEL_LABEL[w.level] ?? w.level },
              { Icon: Users, k: "Capacidad máxima", v: `${w.maxCapacity} alumnos` },
            ].map(({ Icon, k, v }) => (
              <div key={k} className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5">
                <Icon className="mt-0.5 h-4 w-4 text-brand-600" />
                <div><dt className="text-xs font-medium text-slate-500">{k}</dt><dd className="text-sm font-semibold text-slate-900">{v}</dd></div>
              </div>
            ))}
          </dl>
        </article>

        <aside className="card h-fit p-6 lg:sticky lg:top-24">
          <p className="eyebrow">Disponibilidad</p>
          <p className="mt-2 text-3xl font-extrabold tabular text-slate-900">
            {w.registered}<span className="text-lg font-semibold text-slate-400"> / {w.maxCapacity}</span>
          </p>
          <p className="text-sm text-slate-500">inscritos</p>
          <Progress value={pct(w.registered, w.maxCapacity)} className="mt-4" />
          <p className="mt-3 text-sm text-slate-600">Lugares disponibles: <span className="font-bold tabular text-slate-900">{w.available}</span></p>
          {full && w.waitlistCount ? <p className="mt-1 text-sm text-slate-500">{w.waitlistCount} en lista de espera</p> : null}
          <div className="mt-6">
            {canEnroll && <Link href={`/talleres/${w.slug}/inscribirme`} className={buttonVariants({ size: "lg", className: "w-full" })}>INSCRIBIRME</Link>}
            {full && <Link href={`/talleres/${w.slug}/inscribirme`} className={buttonVariants({ size: "lg", variant: "subtle", className: "w-full" })}>UNIRME A LISTA DE ESPERA</Link>}
            {!canEnroll && !full && <p className="rounded-xl bg-slate-50 p-3 text-center text-sm font-medium text-slate-500">Inscripciones no disponibles por ahora.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
