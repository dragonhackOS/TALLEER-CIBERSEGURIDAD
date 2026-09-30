"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api-client";

export function LoginForm() {
  return (
    <React.Suspense>
      <Inner />
    </React.Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [totp, setTotp] = React.useState("");
  const [needTotp, setNeedTotp] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await api<{ ok?: boolean; totpRequired?: boolean }>("/api/admin/auth/login", {
        body: { email, password, ...(needTotp ? { totp } : {}) },
      });
      if (r.totpRequired) {
        setNeedTotp(true);
        return;
      }
      const next = params.get("next");
      // Solo rutas internas del panel (evita open redirect).
      router.replace(next && /^\/admin(\/[a-z0-9/_-]*)?$/i.test(next) ? next : "/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-5">
      <div>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><KeyRound className="h-5 w-5" /></span>
        <h2 className="mt-4 text-2xl font-bold tracking-tight">Iniciar sesión</h2>
        <p className="mt-1 text-sm text-slate-500">Panel administrativo de talleres</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {!needTotp ? (
        <>
          <div>
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </>
      ) : (
        <div>
          <Label htmlFor="totp">Código de verificación (2FA)</Label>
          <Input id="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={totp} onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} className="text-center text-xl tracking-[0.4em]" />
          <p className="mt-1.5 text-xs text-slate-500">Abre tu app de autenticación e ingresa el código de 6 dígitos.</p>
        </div>
      )}
      <Button type="submit" size="lg" variant="navy" className="w-full" loading={loading}>
        {needTotp ? "Verificar" : "Entrar"}
      </Button>
    </form>
  );
}
