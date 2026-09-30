"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarDays, Clock, LogOut, MapPin } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDateTimeLong, formatWorkshopDate, REGISTRATION_STATUS_LABEL } from "@/lib/format";
import { EmailVerification } from "./email-verification";

interface Me {
  email: string;
  registrations: {
    id: string;
    publicId: string;
    code: string;
    status: string;
    createdAt: string;
    checkedInAt: string | null;
    workshop: { name: string; slug: string; date: string; startTime: string; endTime: string; location: string };
  }[];
  waitlist: { id: string; position: number; workshop: { name: string; slug: string } }[];
}

const TONE: Record<string, "green" | "blue" | "gray" | "red" | "amber"> = { REGISTERED: "blue", CHECKED_IN: "green", NO_SHOW: "amber", CANCELLED: "gray" };

export function MyRegistrations({ domain }: { domain: string }) {
  const toast = useToast();
  const [state, setState] = React.useState<"loading" | "verify" | "ready">("loading");
  const [me, setMe] = React.useState<Me | null>(null);
  const [confirm, setConfirm] = React.useState<Me["registrations"][number] | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setMe(await api<Me>("/api/me"));
      setState("ready");
    } catch {
      setState("verify");
    }
  }, []);
  React.useEffect(() => void load(), [load]);

  async function cancel() {
    if (!confirm) return;
    setBusy(true);
    try {
      await api(`/api/me/registrations/${confirm.id}/cancel`, { method: "POST", body: {} });
      toast({ tone: "success", title: "Inscripción cancelada", description: "Tu lugar quedó disponible para otro alumno." });
      setConfirm(null);
      await load();
    } catch (err) {
      toast({ tone: "error", title: "No se pudo cancelar", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function leave(id: string) {
    try {
      await api(`/api/me/waitlist/${id}`, { method: "DELETE" });
      toast({ tone: "success", title: "Saliste de la lista de espera" });
      await load();
    } catch (err) {
      toast({ tone: "error", title: "No se pudo completar", description: err instanceof Error ? err.message : undefined });
    }
  }

  async function logout() {
    await api("/api/session", { method: "DELETE" }).catch(() => undefined);
    setMe(null);
    setState("verify");
  }

  if (state === "loading") return <div className="flex justify-center py-20 text-slate-500"><Spinner /></div>;

  if (state === "verify") {
    return (
      <div className="card mx-auto max-w-lg p-6 sm:p-8">
        <p className="eyebrow">Consulta</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Mi inscripción</h1>
        <p className="mb-6 mt-2 text-sm text-slate-600">Verifica tu correo institucional para ver el estado de tus inscripciones.</p>
        <EmailVerification domain={domain} onVerified={() => void load()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Mi inscripción</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Hola 👋</h1>
          <p className="text-sm text-slate-500">{me?.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}><LogOut className="h-4 w-4" /> Salir</Button>
      </div>

      {me && me.registrations.length === 0 && me.waitlist.length === 0 && (
        <div className="card p-8 text-center">
          <p className="font-semibold text-slate-800">Aún no tienes inscripciones</p>
          <Link href="/#talleres" className={buttonVariants({ className: "mt-4" })}>Ver talleres</Link>
        </div>
      )}

      {me?.registrations.map((r) => (
        <article key={r.id} className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{r.workshop.name}</h2>
              <p className="font-mono text-sm font-semibold text-navy-900">{r.code}</p>
            </div>
            <Badge tone={TONE[r.status] ?? "gray"} dot>{REGISTRATION_STATUS_LABEL[r.status] ?? r.status}</Badge>
          </div>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            <li className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" />{formatWorkshopDate(r.workshop.date, true)}</li>
            <li className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-slate-400" />{r.workshop.startTime} – {r.workshop.endTime}</li>
            <li className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-slate-400" />{r.workshop.location}</li>
          </ul>
          {r.checkedInAt && <p className="mt-3 text-sm text-emerald-700">Asistencia registrada: {formatDateTimeLong(r.checkedInAt)}</p>}
          {r.status !== "CANCELLED" && (
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={`/inscripcion/${r.publicId}`} className={buttonVariants({ size: "sm" })}>Ver comprobante y QR</Link>
              {r.status === "REGISTERED" && <Button size="sm" variant="danger-outline" onClick={() => setConfirm(r)}>Cancelar inscripción</Button>}
            </div>
          )}
        </article>
      ))}

      {me && me.waitlist.length > 0 && (
        <div className="card p-5 sm:p-6">
          <h2 className="font-bold text-slate-900">Listas de espera</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {me.waitlist.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span><span className="font-semibold text-slate-900">{w.workshop.name}</span> · posición <span className="font-bold tabular">#{w.position}</span></span>
                <Button size="sm" variant="ghost" onClick={() => leave(w.id)}>Salir</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title="¿Cancelar inscripción?" description="Tu lugar se liberará inmediatamente y podría asignarse a otro alumno. Esta acción no se puede deshacer.">
        <Alert tone="warning">{confirm?.workshop.name} · {confirm?.code}</Alert>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirm(null)}>Mantener</Button>
          <Button variant="danger" loading={busy} onClick={cancel}>Sí, cancelar</Button>
        </div>
      </Dialog>
    </div>
  );
}
