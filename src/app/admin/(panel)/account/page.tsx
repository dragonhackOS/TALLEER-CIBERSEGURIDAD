"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAdmin } from "@/components/admin/admin-context";
import { PageHeader } from "@/components/admin/ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { ROLE_LABEL } from "@/lib/format";

export default function AccountPage() {
  const admin = useAdmin();
  const router = useRouter();
  const toast = useToast();
  const [pw, setPw] = React.useState({ currentPassword: "", newPassword: "" });
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [setup, setSetup] = React.useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [disablePw, setDisablePw] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPwError(null);
    try {
      await api("/api/admin/me/password", { body: pw });
      toast({ tone: "success", title: "Contraseña actualizada", description: "Inicia sesión de nuevo." });
      router.replace("/admin/login");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function totp(body: Record<string, string>) {
    setBusy(true);
    try {
      const r = await api<{ secret?: string; qrDataUrl?: string }>("/api/admin/me/totp", { body });
      if (body.action === "setup" && r.secret && r.qrDataUrl) setSetup({ secret: r.secret, qrDataUrl: r.qrDataUrl });
      else {
        toast({ tone: "success", title: body.action === "enable" ? "2FA activado" : "2FA desactivado" });
        setSetup(null);
        router.refresh();
      }
    } catch (err) {
      toast({ tone: "error", title: "Error", description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Mi cuenta" title={admin.name} description={`${admin.email} · ${ROLE_LABEL[admin.role]}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Contraseña</CardTitle><CardDescription>Al cambiarla se cerrarán todas tus sesiones.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={changePassword} className="space-y-4">
              {pwError && <Alert tone="error">{pwError}</Alert>}
              <div><Label htmlFor="cp">Contraseña actual</Label><Input id="cp" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></div>
              <div><Label htmlFor="np">Nueva contraseña</Label><Input id="np" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></div>
              <Button type="submit" loading={busy}>Actualizar contraseña</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Verificación en dos pasos (TOTP)</CardTitle><CardDescription>Google Authenticator, Microsoft Authenticator, 1Password, etc.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {admin.totpEnabled ? (
              <>
                <Alert tone="success">La verificación en dos pasos está activa.</Alert>
                <div><Label htmlFor="dp">Confirma tu contraseña para desactivarla</Label><Input id="dp" type="password" value={disablePw} onChange={(e) => setDisablePw(e.target.value)} /></div>
                <Button variant="danger-outline" loading={busy} onClick={() => totp({ action: "disable", password: disablePw })}>Desactivar 2FA</Button>
              </>
            ) : setup ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setup.qrDataUrl} alt="QR de configuración 2FA" className="h-44 w-44 rounded-xl border border-slate-200" />
                <p className="text-xs text-slate-500">¿No puedes escanear? Clave: <code className="break-all">{setup.secret}</code></p>
                <div><Label htmlFor="tc">Código de 6 dígitos</Label><Input id="tc" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></div>
                <Button loading={busy} disabled={code.length !== 6} onClick={() => totp({ action: "enable", code })}>Activar</Button>
              </>
            ) : (
              <Button loading={busy} onClick={() => totp({ action: "setup" })}>Configurar 2FA</Button>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
