"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MailCheck, QrCode, RefreshCw, Shuffle, UserCheck, UserX, XCircle } from "lucide-react";
import { useCan } from "@/components/admin/admin-context";
import { Loading, PageHeader, RegistrationStatusBadge, useApiData } from "@/components/admin/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDateTimeLong, formatWorkshopDate } from "@/lib/format";

interface Detail {
  registration: {
    id: string; publicId: string; code: string; status: string; source: string; qrVersion: number; createdAt: string; cancelledAt: string | null; cancelReason: string | null;
    student: { fullName: string; email: string; classroom: string; semester: number; phone: string | null; programmingExperience: string | null; securityExperience: string | null; ctfBefore: boolean | null };
    workshop: { id: string; name: string; date: string; startTime: string; endTime: string; location: string };
    attendance: { checkedInAt: string; method: string; checkedInBy: { name: string } | null } | null;
  };
  history: { id: string; action: string; actorType: string; admin: { name: string } | null; metadata: unknown; createdAt: string }[];
  emails: { id: string; template: string; status: string; createdAt: string; sentAt: string | null; attempts: number }[];
}

export default function RegistrationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const canWrite = useCan("registrations:write");
  const canCheckin = useCan("checkin:write");
  const { data, error, reload } = useApiData<Detail>(`/api/admin/registrations/${id}`);
  const { data: ws } = useApiData<{ workshops: { id: string; name: string; available: number; archived: boolean }[] }>(canWrite ? "/api/admin/workshops" : null);
  const [dialog, setDialog] = React.useState<"cancel" | "move" | null>(null);
  const [reason, setReason] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [qrKey, setQrKey] = React.useState(0);

  async function act(body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      await api(`/api/admin/registrations/${id}`, { method: "PATCH", body });
      toast({ tone: "success", title: success });
      setDialog(null);
      setQrKey((k) => k + 1);
      await reload();
    } catch (err) {
      toast({ tone: "error", title: "No se pudo completar", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Loading />;
  const r = data.registration;
  const active = ["REGISTERED", "CHECKED_IN", "NO_SHOW"].includes(r.status);
  const EXP: Record<string, string> = { NINGUNA: "Ninguna", BASICA: "Básica", INTERMEDIA: "Intermedia", AVANZADA: "Avanzada" };

  return (
    <>
      <Link href="/admin/registrations" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Inscripciones</Link>
      <PageHeader eyebrow={r.code} title={r.student.fullName} description={r.student.email} actions={<RegistrationStatusBadge status={r.status} />} />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader><CardTitle>Datos</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                {[
                  ["Taller", r.workshop.name],
                  ["Fecha y horario", `${formatWorkshopDate(r.workshop.date, true)} · ${r.workshop.startTime}–${r.workshop.endTime}`],
                  ["Lugar", r.workshop.location],
                  ["Salón / Semestre", `${r.student.classroom} · ${r.student.semester}°`],
                  ["Teléfono", r.student.phone ?? "—"],
                  ["Inscrito", formatDateTimeLong(r.createdAt)],
                  ["Origen", r.source === "WAITLIST" ? "Lista de espera" : r.source === "ADMIN" ? "Administrador" : "Web"],
                  ["Programación / Ciberseguridad", `${EXP[r.student.programmingExperience ?? ""] ?? "—"} / ${EXP[r.student.securityExperience ?? ""] ?? "—"}`],
                  ["¿CTF antes?", r.student.ctfBefore === null ? "—" : r.student.ctfBefore ? "Sí" : "No"],
                  ["Asistencia", r.attendance ? `${formatDateTimeLong(r.attendance.checkedInAt)} (${r.attendance.method}${r.attendance.checkedInBy ? ` · ${r.attendance.checkedInBy.name}` : ""})` : "—"],
                ].map(([k, v]) => (
                  <div key={k}><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>
                ))}
              </dl>
              {r.cancelledAt && <Alert tone="warning" className="mt-4" title={`Cancelada el ${formatDateTimeLong(r.cancelledAt)}`}>{r.cancelReason ?? ""}</Alert>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Historial</CardTitle></CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {data.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600 ring-1 ring-brand-200" />
                    <p className="text-sm font-semibold text-slate-900">{h.action.replaceAll("_", " ")}</p>
                    <p className="text-xs text-slate-500">{formatDateTimeLong(h.createdAt)} · {h.admin?.name ?? (h.actorType === "STUDENT" ? "Estudiante" : "Sistema")}</p>
                  </li>
                ))}
              </ol>
              <h4 className="mt-6 text-sm font-semibold text-slate-900">Correos</h4>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {data.emails.map((e) => (
                  <li key={e.id} className="flex items-center justify-between py-2">
                    <span className="text-slate-700">{e.template.replaceAll("_", " ").toLowerCase()}</span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">{formatDateTimeLong(e.createdAt)} <Badge tone={e.status === "SENT" ? "green" : e.status === "FAILED" ? "red" : "amber"}>{e.status}</Badge></span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>QR de asistencia</CardTitle></CardHeader>
            <CardContent className="flex flex-col items-center">
              {active ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={qrKey} src={`/api/admin/registrations/${r.id}/qr?v=${r.qrVersion}`} alt="QR" className="h-48 w-48 rounded-xl border border-slate-200 p-2" />
              ) : <p className="text-sm text-slate-500">No disponible.</p>}
              <p className="mt-2 text-xs text-slate-500">Versión {r.qrVersion}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Acciones</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {canCheckin && r.status !== "CHECKED_IN" && active && <Button variant="primary" loading={busy} onClick={() => act({ action: "checkin" }, "Asistencia registrada")}><UserCheck className="h-4 w-4" /> Marcar asistencia</Button>}
              {canCheckin && r.status === "CHECKED_IN" && <Button variant="secondary" loading={busy} onClick={() => act({ action: "undo_checkin" }, "Asistencia revertida")}><RefreshCw className="h-4 w-4" /> Revertir asistencia</Button>}
              {canCheckin && r.status === "REGISTERED" && <Button variant="secondary" loading={busy} onClick={() => act({ action: "mark_no_show" }, "Marcado como ausente")}><UserX className="h-4 w-4" /> Marcar como ausente</Button>}
              {canWrite && active && (
                <>
                  <Button variant="secondary" loading={busy} onClick={() => act({ action: "resend_confirmation" }, "Confirmación reenviada")}><MailCheck className="h-4 w-4" /> Reenviar confirmación</Button>
                  <Button variant="secondary" loading={busy} onClick={() => act({ action: "regenerate_qr" }, "QR regenerado: el anterior ya no es válido")}><QrCode className="h-4 w-4" /> Regenerar QR</Button>
                  {r.status === "REGISTERED" && <Button variant="secondary" onClick={() => setDialog("move")}><Shuffle className="h-4 w-4" /> Cambiar taller</Button>}
                  <Button variant="danger-outline" onClick={() => setDialog("cancel")}><XCircle className="h-4 w-4" /> Cancelar inscripción</Button>
                </>
              )}
              {!canWrite && !canCheckin && <p className="text-sm text-slate-500">Solo lectura.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={dialog === "cancel"} onClose={() => setDialog(null)} title="Cancelar inscripción" description="El lugar se liberará y, si hay lista de espera, se promoverá automáticamente al siguiente alumno.">
        <Label htmlFor="reason" optional>Motivo</Label>
        <Input id="reason" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDialog(null)}>Volver</Button>
          <Button variant="danger" loading={busy} onClick={() => act({ action: "cancel", ...(reason ? { reason } : {}) }, "Inscripción cancelada")}>Cancelar inscripción</Button>
        </div>
      </Dialog>
      <Dialog open={dialog === "move"} onClose={() => setDialog(null)} title="Cambiar de taller" description="Se conserva el código. Solo talleres con lugares disponibles.">
        <Label htmlFor="target">Taller destino</Label>
        <Select id="target" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Selecciona…</option>
          {ws?.workshops.filter((w) => w.id !== r.workshop.id && !w.archived).map((w) => <option key={w.id} value={w.id} disabled={w.available <= 0}>{w.name} ({w.available} disponibles)</option>)}
        </Select>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDialog(null)}>Volver</Button>
          <Button loading={busy} disabled={!target} onClick={() => act({ action: "move", targetWorkshopId: target }, "Alumno cambiado de taller")}>Mover</Button>
        </div>
      </Dialog>
    </>
  );
}
