import { ArrowRight, MailCheck, QrCode, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { WorkshopGrid } from "@/components/public/workshop-grid";
import { buttonVariants } from "@/components/ui/button";
import { env } from "@/lib/env";
import { listPublicWorkshops } from "@/server/services/workshop.service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const workshops = await listPublicWorkshops();
  const domain = env().ALLOWED_EMAIL_DOMAIN;
  return (
    <>
      <section className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_110%_-10%,theme(colors.brand.100),transparent_60%),radial-gradient(40rem_24rem_at_-10%_120%,theme(colors.brand.50),transparent_60%)]" />
        <div className="container relative py-14 sm:py-20">
          <div className="max-w-2xl animate-fade-in">
            <p className="eyebrow text-brand-700">Escuela Preparatoria Yucatán</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Talleres para aprender haciendo.</h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              Elige un taller, verifica tu correo institucional y asegura tu lugar en minutos. Los cupos son limitados y se asignan en tiempo real.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="#talleres" className={buttonVariants({ size: "lg" })}>
                Ver talleres <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/mi-inscripcion" className={buttonVariants({ size: "lg", variant: "secondary" })}>
                Consultar mi inscripción
              </Link>
            </div>
          </div>
          <ul className="mt-12 grid max-w-3xl gap-3 sm:grid-cols-3">
            {[
              { Icon: MailCheck, t: "Correo institucional", d: `Solo cuentas @${domain}` },
              { Icon: ShieldCheck, t: "Cupo garantizado", d: "Nunca se sobrepasa el límite" },
              { Icon: QrCode, t: "QR de asistencia", d: "Tu pase para el check-in" },
            ].map(({ Icon, t, d }) => (
              <li key={t} className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/80 p-3.5 shadow-soft">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-[18px] w-[18px]" /></span>
                <div className="leading-tight"><p className="text-sm font-semibold text-slate-900">{t}</p><p className="text-xs text-slate-500">{d}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="talleres" className="container scroll-mt-20 py-12 sm:py-16">
        <div className="mb-8 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Oferta actual</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Talleres disponibles</h2>
          </div>
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-2 w-2 animate-pulse-dot rounded-full bg-emerald-500" /> Cupos actualizados automáticamente
          </p>
        </div>
        <WorkshopGrid initial={workshops} />
      </section>
    </>
  );
}
