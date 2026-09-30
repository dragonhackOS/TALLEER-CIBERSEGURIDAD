"use client";

import * as React from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { isInstitutionalEmail, normalizeEmail } from "@/lib/email-domain";
import { Turnstile } from "./turnstile";

/**
 * Paso 1–2: correo institucional + código OTP de 6 dígitos.
 * La validación del navegador es solo una ayuda; el servidor decide.
 */
export function EmailVerification({
  domain,
  onVerified,
  intro,
}: {
  domain: string;
  onVerified: (info: { email: string; expiresAt: string }) => void;
  intro?: React.ReactNode;
}) {
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [email, setEmail] = React.useState("");
  const [digits, setDigits] = React.useState<string[]>(Array(6).fill(""));
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [challenge, setChallenge] = React.useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = React.useState<string | undefined>();
  const [resendIn, setResendIn] = React.useState(0);
  const honeypot = React.useRef<HTMLInputElement>(null);
  const inputs = React.useRef<(HTMLInputElement | null)[]>([]);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const localValid = isInstitutionalEmail(email, domain);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    const normalized = normalizeEmail(email);
    if (!isInstitutionalEmail(normalized, domain)) {
      setError(`Usa tu correo institucional @${domain}.`);
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/request-code", {
        body: { email: normalized, website_url: honeypot.current?.value ?? "", ...(turnstileToken ? { turnstileToken } : {}) },
      });
      setEmail(normalized);
      setStep("code");
      setDigits(Array(6).fill(""));
      setResendIn(60);
      setInfo(`Enviamos un código de 6 dígitos a ${normalized}.`);
      setTimeout(() => inputs.current[0]?.focus(), 50);
    } catch (err) {
      if (err instanceof ApiError && err.code === "CHALLENGE_REQUIRED") setChallenge(String(err.details?.siteKey ?? ""));
      setError(err instanceof Error ? err.message : "No pudimos enviar el código.");
    } finally {
      setLoading(false);
    }
  }

  async function verify(code: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ email: string; expiresAt: string }>("/api/auth/verify-code", { body: { email, code } });
      onVerified(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido.");
      setDigits(Array(6).fill(""));
      setTimeout(() => inputs.current[0]?.focus(), 30);
    } finally {
      setLoading(false);
    }
  }

  function setDigit(i: number, v: string) {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      // Pegado de código completo
      const arr = clean.slice(0, 6).split("");
      const next = Array(6).fill("").map((_, k) => arr[k] ?? "");
      setDigits(next);
      if (arr.length === 6) void verify(arr.join(""));
      else inputs.current[Math.min(arr.length, 5)]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) inputs.current[i + 1]?.focus();
    if (next.every((d) => d !== "")) void verify(next.join(""));
  }

  if (step === "email") {
    return (
      <form onSubmit={requestCode} noValidate className="space-y-5">
        {intro}
        <div>
          <Label htmlFor="email">Correo institucional</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={`alumno@${domain}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10"
              invalid={!!error}
              required
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">Solo se aceptan correos que terminen exactamente en <span className="font-semibold">@{domain}</span>.</p>
          <FieldError>{error}</FieldError>
        </div>
        {/* Honeypot: invisible para personas, atractivo para bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="website_url">Sitio web</label>
          <input ref={honeypot} id="website_url" name="website_url" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        {challenge && <Turnstile siteKey={challenge} onToken={setTurnstileToken} />}
        <Button type="submit" size="lg" className="w-full" loading={loading} disabled={!localValid || (!!challenge && !turnstileToken)}>
          ENVIAR CÓDIGO
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      {info && <Alert tone="info">{info}</Alert>}
      <div>
        <Label htmlFor="otp-0">Código de verificación</Label>
        <div className="flex justify-between gap-2 sm:justify-start" role="group" aria-label="Código de 6 dígitos">
          {digits.map((d, i) => (
            <input
              key={i}
              id={`otp-${i}`}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
              }}
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={6}
              aria-label={`Dígito ${i + 1}`}
              disabled={loading}
              className="h-14 w-12 rounded-xl border border-slate-300 bg-white text-center text-2xl font-bold tabular text-slate-900 shadow-sm transition focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100 sm:w-14"
            />
          ))}
        </div>
        <FieldError>{error}</FieldError>
      </div>
      <Button size="lg" className="w-full" loading={loading} disabled={digits.some((d) => !d)} onClick={() => verify(digits.join(""))}>
        <ShieldCheck className="h-4 w-4" /> VERIFICAR
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button className="font-medium text-slate-500 hover:text-slate-800" onClick={() => { setStep("email"); setError(null); }}>
          Cambiar correo
        </button>
        <button className="font-medium text-brand-700 hover:text-brand-900 disabled:text-slate-400" disabled={resendIn > 0 || loading} onClick={() => requestCode()}>
          {resendIn > 0 ? `Reenviar en ${resendIn}s` : "Reenviar código"}
        </button>
      </div>
    </div>
  );
}
