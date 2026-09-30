import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock, Download, MapPin, User, XCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTimeLong, formatWorkshopDate } from "@/lib/format";
import { getPublicRegistration } from "@/server/services/registration.service";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inscripción confirmada", referrer: "no-referrer" };

export default async function ConfirmationPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!/^reg_[0-9a-z]{26}$/.test(publicId)) notFound();
  const r = await getPublicRegistration(publicId);
  if (!r) notFound();
  const cancelled = r.status === "CANCELLED";
  const checkedIn = r.status === "CHECKED_IN";

  return (
    <div className="container max-w-2xl py-8 sm:py-14">
      <article className="card overflow-hidden">
        <header className={cancelled ? "bg-slate-700 px-6 py-8 text-white sm:px-10" : "bg-gradient-to-br from-brand-700 to-navy-900 px-6 py-8 text-white sm:px-10"}>
          <div className="flex items-center gap-3">
            {cancelled ? <XCircle className="h-8 w-8" /> : <CheckCircle2 className="h-8 w-8 text-emerald-300" />}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{cancelled ? "Inscripción" : "Listo"}</p>
              <h1 className="text-2xl font-extrabold tracking-tight">{cancelled ? "INSCRIPCIÓN CANCELADA" : "INSCRIPCIÓN CONFIRMADA"}</h1>
            </div>
          </div>
        </header>

        <div className="grid gap-8 p-6 sm:grid-cols-[1fr_auto] sm:p-10">
          <dl className="space-y-4 text-sm">
            <div><dt className="text-slate-500">Nombre</dt><dd className="text-base font-semibold text-slate-900">{r.studentName}</dd></div>
            <div><dt className="text-slate-500">Taller</dt><dd className="text-base font-semibold text-slate-900">{r.workshop.name}</dd></div>
            <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" /><div><dt className="text-slate-500">Fecha</dt><dd className="font-medium text-slate-900">{formatWorkshopDate(r.workshop.date, true)}</dd></div></div>
            <div className="flex items-start gap-2"><Clock className="mt-0.5 h-4 w-4 text-slate-400" /><div><dt className="text-slate-500">Horario</dt><dd className="font-medium tabular text-slate-900">{r.workshop.startTime} - {r.workshop.endTime}</dd></div></div>
            <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 text-slate-400" /><div><dt className="text-slate-500">Lugar</dt><dd className="font-medium text-slate-900">{r.workshop.location}</dd></div></div>
            <div className="flex items-start gap-2"><User className="mt-0.5 h-4 w-4 text-slate-400" /><div><dt className="text-slate-500">Instructor</dt><dd className="font-medium text-slate-900">{r.workshop.instructor}</dd></div></div>
            <div className="rounded-xl bg-slate-50 p-4">
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">Código</dt>
              <dd className="mt-1 font-mono text-xl font-bold tracking-wider text-navy-900">{r.code}</dd>
            </div>
          </dl>

          {!cancelled && (
            <div className="flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/registration/${r.publicId}/qr`} alt="Código QR de asistencia" width={220} height={220} className="h-[220px] w-[220px] rounded-2xl border border-slate-200 bg-white p-2 shadow-soft" />
              <p className="mt-3 max-w-[220px] text-center text-xs text-slate-500">Presenta este QR el día del taller. No contiene datos personales.</p>
              {checkedIn && r.checkedInAt && <p className="mt-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Asistencia registrada · {formatDateTimeLong(r.checkedInAt)}</p>}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-5 no-print sm:px-10">
          {!cancelled && (
            <a href={`/api/registration/${r.publicId}/qr?download=1`} className={buttonVariants()}>
              <Download className="h-4 w-4" /> DESCARGAR / VER QR
            </a>
          )}
          <PrintButton />
          <Link href="/mi-inscripcion" className={buttonVariants({ variant: "ghost" })}>Mis inscripciones</Link>
        </footer>
      </article>
      {!cancelled && <p className="mt-4 text-center text-sm text-slate-500 no-print">También enviamos esta confirmación a tu correo institucional.</p>}
    </div>
  );
}
