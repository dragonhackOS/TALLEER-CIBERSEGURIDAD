import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EnrollmentWizard } from "@/features/enrollment/enrollment-wizard";
import { env } from "@/lib/env";
import { getPublicWorkshop } from "@/server/services/workshop.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inscripción" };

export default async function EnrollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) notFound();
  const w = await getPublicWorkshop(slug);
  if (!w) notFound();
  const closed = w.publicStatus === "CERRADO" || w.publicStatus === "PROXIMAMENTE";
  return (
    <div className="container max-w-5xl py-8 sm:py-12">
      <Link href={`/talleres/${w.slug}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Volver al taller
      </Link>
      <div className="mt-6">
        {closed ? (
          <div className="card p-10 text-center">
            <p className="text-lg font-semibold text-slate-900">Las inscripciones para este taller no están disponibles.</p>
            <p className="mt-1 text-sm text-slate-500">Consulta otros talleres disponibles.</p>
          </div>
        ) : (
          <EnrollmentWizard workshop={w} domain={env().ALLOWED_EMAIL_DOMAIN} sessionMinutes={env().SESSION_TIMEOUT_MINUTES} />
        )}
      </div>
    </div>
  );
}
