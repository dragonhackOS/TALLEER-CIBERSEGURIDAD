"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loading, PageHeader, useApiData } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";

interface S {
  branding: { schoolName: string; logoUrl: string };
  config: { allowedDomain: string; registrationPolicy: string; otpMinutes: number; reservationMinutes: number; sessionMinutes: number; adminSessionHours: number; smtpConfigured: boolean; emailFrom: string; turnstile: boolean; timezone: string; notificationRecipients: string[] };
}

export default function SettingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, loading } = useApiData<S>("/api/admin/settings");
  const [schoolName, setSchoolName] = React.useState("");
  const [logoUrl, setLogoUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (data) {
      setSchoolName(data.branding.schoolName);
      setLogoUrl(data.branding.logoUrl);
    }
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await api("/api/admin/settings", { method: "PUT", body: { schoolName, logoUrl } });
      toast({ tone: "success", title: "Configuración guardada" });
      router.refresh();
    } catch (err) {
      toast({ tone: "error", title: "Error", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) return <Loading />;
  const c = data.config;
  const rows: [string, React.ReactNode][] = [
    ["Dominio de correo permitido", <code key="d">@{c.allowedDomain}</code>],
    ["Política de inscripción", c.registrationPolicy === "ONE_PER_EVENT" ? "Un taller por evento" : "Un registro por taller"],
    ["Expiración de OTP", `${c.otpMinutes} min`],
    ["Reserva temporal", `${c.reservationMinutes} min`],
    ["Inactividad del formulario", `${c.sessionMinutes} min`],
    ["Sesión administrativa", `${c.adminSessionHours} h`],
    ["SMTP", c.smtpConfigured ? <Badge key="s" tone="green">Configurado</Badge> : <Badge key="s" tone="amber">Sin configurar (solo log)</Badge>],
    ["Remitente", c.emailFrom],
    ["Turnstile", c.turnstile ? <Badge key="t" tone="green">Activo (dinámico)</Badge> : <Badge key="t">Desactivado</Badge>],
    ["Zona horaria", c.timezone],
    ["Destinatarios de notificaciones", c.notificationRecipients.join(", ") || "—"],
  ];
  return (
    <>
      <PageHeader eyebrow="Sistema" title="Configuración" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Identidad institucional</CardTitle><CardDescription>Nombre y logo mostrados en la plataforma.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl || "/brand/logo.svg"} alt="Vista previa del logo" className="h-14 w-14 rounded-lg object-contain" />
              <div><p className="text-sm font-bold tracking-wider">{schoolName}</p><p className="text-xs text-brand-700">Talleres</p></div>
            </div>
            <div><Label htmlFor="sn">Nombre de la institución</Label><Input id="sn" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} /></div>
            <div>
              <Label htmlFor="logo">URL del logo oficial</Label>
              <Input id="logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="/brand/logo.svg o https://…" />
              <p className="mt-1.5 text-xs text-slate-500">Coloca el archivo en <code>public/brand/</code> y usa la ruta <code>/brand/archivo.svg</code>, o una URL https.</p>
            </div>
            <Button loading={busy} onClick={save}>Guardar</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Parámetros del sistema</CardTitle><CardDescription>Se definen con variables de entorno (.env).</CardDescription></CardHeader>
          <CardContent>
            <dl className="divide-y divide-slate-100 text-sm">
              {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2.5"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-900">{v}</dd></div>)}
            </dl>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
