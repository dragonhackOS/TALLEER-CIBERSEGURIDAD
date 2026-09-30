"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Clock, Hourglass, Lock, MapPin, TimerReset } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { PublicWorkshop } from "@/components/public/workshop-card";
import { api, ApiError, fieldErrors } from "@/lib/api-client";
import { formatWorkshopDate, LEVEL_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmailVerification } from "./email-verification";
import { Turnstile } from "./turnstile";
import { mmss, useSessionTimeout } from "./use-session-timeout";

type Step = "loading" | "verify" | "form" | "expired";
type Mode = "register" | "waitlist" | "already";

interface Profile {
  fullName: string;
  classroom: string;
  semester: string;
  phone: string;
  programmingExperience: string;
  securityExperience: string;
  ctfBefore: "" | "yes" | "no";
  privacyAccepted: boolean;
}

const EMPTY: Profile = { fullName: "", classroom: "", semester: "", phone: "", programmingExperience: "", securityExperience: "", ctfBefore: "", privacyAccepted: false };
const EXPERIENCE = [
  ["NINGUNA", "Ninguna"],
  ["BASICA", "Básica"],
  ["INTERMEDIA", "Intermedia"],
  ["AVANZADA", "Avanzada"],
] as const;

const REQUEST_TIMEOUT_MS = 10_000;

function StepDots({ current }: { current: number }) {
  const labels = ["Correo", "Verificación", "Datos", "Confirmación"];
  return (
    <ol className="flex items-center gap-2" aria-label="Progreso">
      {labels.map((l, i) => (
        <li key={l} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
              i < current ? "bg-brand-700 text-white" : i === current ? "bg-brand-100 text-brand-800 ring-2 ring-brand-600" : "bg-slate-100 text-slate-400",
            )}
          >
            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={cn("hidden text-xs font-medium sm:inline", i === current ? "text-slate-900" : "text-slate-400")}>{l}</span>
          {i < labels.length - 1 && <span className="h-px w-4 bg-slate-200 sm:w-6" />}
        </li>
      ))}
    </ol>
  );
}

export function EnrollmentWizard({ workshop, domain, sessionMinutes }: { workshop: PublicWorkshop; domain: string; sessionMinutes: number }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("loading");
  const [mode, setMode] = React.useState<Mode>("register");
  const [email, setEmail] = React.useState("");
  const [sessionExpiresAt, setSessionExpiresAt] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<Profile>(EMPTY);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<{ tone: "error" | "warning"; title?: string; text: string } | null>(null);
  const [existing, setExisting] = React.useState<{ publicId?: string; workshopName?: string } | null>(null);
  const [reservation, setReservation] = React.useState<{ id: string; expiresAt: number } | null>(null);
  const [reserving, setReserving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [challenge, setChallenge] = React.useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = React.useState<string | undefined>();
  const [now, setNow] = React.useState(() => Date.now());
  const honeypot = React.useRef<HTMLInputElement>(null);
  const idem = React.useRef<{ key: string; hash: string } | null>(null);
  const reservationRef = React.useRef<string | null>(null);

  const onExpired = React.useCallback(() => {
    setStep("expired");
    setReservation(null);
    reservationRef.current = null;
  }, []);
  const session = useSessionTimeout(step === "form" ? sessionExpiresAt : null, onExpired);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* ---------- Reserva ---------- */
  const reserve = React.useCallback(async () => {
    setReserving(true);
    setFormError(null);
    try {
      const r = await api<{ reservationId: string; expiresAt: string; serverTime: string }>("/api/reservations", { body: { workshopId: workshop.id } });
      const skew = Date.now() - Date.parse(r.serverTime);
      setReservation({ id: r.reservationId, expiresAt: Date.parse(r.expiresAt) + skew });
      reservationRef.current = r.reservationId;
      setMode("register");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "WORKSHOP_FULL") setMode("waitlist");
        else if (err.code === "ALREADY_REGISTERED") {
          setMode("already");
          setExisting((err.details as { publicId?: string; workshopName?: string }) ?? {});
        } else if (err.code === "SESSION_EXPIRED" || err.status === 401) onExpired();
        else setFormError({ tone: "error", text: err.message });
      }
    } finally {
      setReserving(false);
    }
  }, [workshop.id, onExpired]);

  const enterForm = React.useCallback(
    async (info: { email: string; expiresAt: string }, prefill?: Partial<Profile>) => {
      setEmail(info.email);
      setSessionExpiresAt(info.expiresAt);
      if (prefill) setProfile((p) => ({ ...p, ...prefill }));
      setStep("form");
      await reserve();
    },
    [reserve],
  );

  /* ---------- Sesión existente ---------- */
  React.useEffect(() => {
    api<{
      authenticated: boolean;
      email?: string;
      expiresAt?: string;
      profile?: { fullName: string | null; classroom: string | null; semester: number | null; phone: string | null; programmingExperience: string | null; securityExperience: string | null; ctfBefore: boolean | null } | null;
    }>("/api/session")
      .then((s) => {
        if (s.authenticated && s.email && s.expiresAt) {
          const p = s.profile;
          void enterForm(
            { email: s.email, expiresAt: s.expiresAt },
            p
              ? {
                  fullName: p.fullName ?? "",
                  classroom: p.classroom ?? "",
                  semester: p.semester ? String(p.semester) : "",
                  phone: p.phone ?? "",
                  programmingExperience: p.programmingExperience ?? "",
                  securityExperience: p.securityExperience ?? "",
                  ctfBefore: p.ctfBefore === null ? "" : p.ctfBefore ? "yes" : "no",
                }
              : undefined,
          );
        } else setStep("verify");
      })
      .catch(() => setStep("verify"));
  }, [enterForm]);

  /* ---------- Liberar reserva al abandonar la página (best effort; el servidor la expira igual) ---------- */
  React.useEffect(() => {
    const release = () => {
      const id = reservationRef.current;
      if (!id) return;
      const m = document.cookie.match(/(?:^|;\s*)(?:__Host-)?py_csrf=([^;]+)/);
      void fetch(`/api/reservations/${id}`, {
        method: "DELETE",
        keepalive: true,
        credentials: "same-origin",
        headers: { "X-CSRF-Token": m ? decodeURIComponent(m[1]) : "" },
      }).catch(() => undefined);
    };
    window.addEventListener("pagehide", release);
    return () => window.removeEventListener("pagehide", release);
  }, []);

  const reservationLeft = reservation ? Math.max(0, Math.floor((reservation.expiresAt - now) / 1000)) : 0;
  const reservationExpired = !!reservation && reservationLeft === 0;

  /* ---------- Envío ---------- */
  function payloadProfile() {
    return {
      fullName: profile.fullName.trim(),
      classroom: profile.classroom.trim(),
      semester: Number(profile.semester) || 0,
      ...(profile.phone.trim() ? { phone: profile.phone.trim() } : {}),
      ...(profile.programmingExperience ? { programmingExperience: profile.programmingExperience } : {}),
      ...(profile.securityExperience ? { securityExperience: profile.securityExperience } : {}),
      ...(profile.ctfBefore ? { ctfBefore: profile.ctfBefore === "yes" } : {}),
      privacyAccepted: profile.privacyAccepted,
    };
  }

  function validateLocal(): boolean {
    const e: Record<string, string> = {};
    if (profile.fullName.trim().length < 5) e["profile.fullName"] = "Escribe tu nombre completo.";
    if (!profile.classroom.trim()) e["profile.classroom"] = "Indica tu salón.";
    if (!profile.semester) e["profile.semester"] = "Selecciona tu semestre.";
    if (!profile.privacyAccepted) e["profile.privacyAccepted"] = "Debes aceptar el aviso de privacidad.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    if (!validateLocal()) return;

    // Deshabilitar INMEDIATAMENTE (evita doble clic).
    setSubmitting(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      if (mode === "waitlist") {
        const r = await api<{ position: number }>("/api/waitlist", {
          body: { workshopId: workshop.id, profile: payloadProfile(), website_url: honeypot.current?.value ?? "" },
          signal: controller.signal,
        });
        setFormError({ tone: "warning", title: "Estás en la lista de espera", text: `Tu posición actual es #${r.position}. Si se libera un lugar te inscribiremos automáticamente y recibirás un correo.` });
        setMode("already");
        setExisting(null);
        return;
      }

      const body = {
        workshopId: workshop.id,
        ...(reservation ? { reservationId: reservation.id } : {}),
        profile: payloadProfile(),
        website_url: honeypot.current?.value ?? "",
      };
      // Misma clave de idempotencia mientras el contenido no cambie.
      const hash = JSON.stringify(body);
      if (!idem.current || idem.current.hash !== hash) idem.current = { key: crypto.randomUUID(), hash };

      const res = await api<{ redirect: string }>("/api/registrations", {
        body: { ...body, ...(turnstileToken ? { turnstileToken } : {}) },
        headers: { "Idempotency-Key": idem.current.key },
        signal: controller.signal,
      });
      reservationRef.current = null;
      router.push(res.redirect);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setFormError({
          tone: "warning",
          title: "Tiempo de espera agotado",
          text: "No pudimos confirmar tu inscripción. Consulta tu estado antes de volver a intentarlo.",
        });
      } else if (err instanceof ApiError) {
        setErrors(Object.fromEntries(Object.entries(fieldErrors(err))));
        if (err.code === "WORKSHOP_FULL") {
          setMode("waitlist");
          setReservation(null);
          setFormError({ tone: "error", title: "Cupo lleno", text: err.message + " Puedes unirte a la lista de espera." });
        } else if (err.code === "ALREADY_REGISTERED") {
          setMode("already");
          setExisting((err.details as { publicId?: string }) ?? {});
        } else if (err.code === "SESSION_EXPIRED") onExpired();
        else if (err.code === "CHALLENGE_REQUIRED") {
          setChallenge(String(err.details?.siteKey ?? ""));
          setFormError({ tone: "warning", text: err.message });
        } else setFormError({ tone: "error", text: err.message });
      } else {
        setFormError({ tone: "error", text: "No pudimos conectar con el servidor. Consulta tu estado antes de volver a intentarlo." });
      }
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  }

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setProfile((p) => ({ ...p, [k]: v }));
  const err = (k: string) => errors[`profile.${k}`];

  /* ---------- Render ---------- */
  const stepIndex = step === "verify" ? 0 : step === "form" ? 2 : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="card p-5 sm:p-8">
        <div className="mb-7 flex flex-col gap-4">
          <div>
            <p className="eyebrow">Inscripción</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{workshop.name}</h1>
          </div>
          <StepDots current={stepIndex} />
        </div>

        {step === "loading" && (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
            <Spinner /> Preparando formulario…
          </div>
        )}

        {step === "verify" && (
          <EmailVerification
            domain={domain}
            onVerified={(info) => void enterForm(info)}
            intro={<p className="text-sm leading-relaxed text-slate-600">Para inscribirte necesitamos verificar que controlas tu correo institucional. Te enviaremos un código de 6 dígitos.</p>}
          />
        )}

        {step === "expired" && (
          <div className="space-y-4 py-4">
            <Alert tone="warning" title="Tu sesión expiró">
              Por seguridad cerramos el formulario tras {sessionMinutes} minutos de inactividad y liberamos tu lugar reservado.
            </Alert>
            <Button onClick={() => { setStep("verify"); setReservation(null); }}>Verificar de nuevo</Button>
          </div>
        )}

        {step === "form" && (
          <form onSubmit={submit} noValidate className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <Lock className="h-4 w-4 text-emerald-600" />
              <span className="text-slate-600">Correo verificado:</span>
              <span className="font-semibold text-slate-900">{email}</span>
            </div>

            {/* Estado de la reserva */}
            {mode === "register" && (
              <div aria-live="polite">
                {reserving && (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-600">
                    <Spinner className="h-4 w-4" /> Reservando tu lugar…
                  </div>
                )}
                {!reserving && reservation && !reservationExpired && (
                  <div className={cn("flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm", reservationLeft <= 60 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-brand-200 bg-brand-50 text-brand-900")}>
                    <span className="flex items-center gap-2"><Hourglass className="h-4 w-4" /> Tu lugar está reservado durante</span>
                    <span className="font-mono text-base font-bold tabular">{mmss(reservationLeft)}</span>
                  </div>
                )}
                {!reserving && reservationExpired && (
                  <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                    <span>Tu reserva expiró y el lugar se liberó. Puedes intentar reservar de nuevo.</span>
                    <Button type="button" size="sm" variant="secondary" onClick={() => void reserve()}>
                      <TimerReset className="h-4 w-4" /> Reservar de nuevo
                    </Button>
                  </div>
                )}
              </div>
            )}

            {mode === "waitlist" && (
              <Alert tone="warning" title="CUPO LLENO">
                Este taller ya no tiene lugares. Completa tus datos para <strong>unirte a la lista de espera</strong>: si alguien cancela, te inscribiremos automáticamente en orden de llegada.
              </Alert>
            )}

            {mode === "already" && (
              <div className="space-y-4">
                {formError ? (
                  <Alert tone={formError.tone === "warning" ? "success" : "error"} title={formError.title}>{formError.text}</Alert>
                ) : (
                  <Alert tone="info" title="Ya tienes una inscripción activa.">
                    {existing?.workshopName ? <>Estás inscrito en <strong>{existing.workshopName}</strong>.</> : "No es posible registrarte nuevamente."}
                  </Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  {existing?.publicId && <Link className={buttonVariants()} href={`/inscripcion/${existing.publicId}`}>Ver mi inscripción</Link>}
                  <Link className={buttonVariants({ variant: "secondary" })} href="/mi-inscripcion">Mis inscripciones</Link>
                </div>
              </div>
            )}

            {mode !== "already" && (
              <>
                <fieldset className="grid gap-5 sm:grid-cols-2" disabled={submitting}>
                  <legend className="sr-only">Datos del alumno</legend>
                  <div className="sm:col-span-2">
                    <Label htmlFor="fullName">Nombre completo</Label>
                    <Input id="fullName" autoComplete="name" maxLength={120} value={profile.fullName} onChange={(e) => set("fullName", e.target.value)} invalid={!!err("fullName")} />
                    <FieldError>{err("fullName")}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="classroom">Salón</Label>
                    <Input id="classroom" maxLength={20} placeholder="Ej. 31" value={profile.classroom} onChange={(e) => set("classroom", e.target.value)} invalid={!!err("classroom")} />
                    <FieldError>{err("classroom")}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="semester">Semestre</Label>
                    <Select id="semester" value={profile.semester} onChange={(e) => set("semester", e.target.value)} invalid={!!err("semester")}>
                      <option value="">Selecciona…</option>
                      {[1, 2, 3, 4, 5, 6].map((s) => <option key={s} value={s}>{s}° semestre</option>)}
                    </Select>
                    <FieldError>{err("semester")}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="phone" optional>Teléfono</Label>
                    <Input id="phone" type="tel" autoComplete="tel" maxLength={20} value={profile.phone} onChange={(e) => set("phone", e.target.value)} invalid={!!err("phone")} />
                    <FieldError>{err("phone")}</FieldError>
                  </div>
                  <div>
                    <Label htmlFor="ctf" optional>¿Has participado antes en un CTF?</Label>
                    <Select id="ctf" value={profile.ctfBefore} onChange={(e) => set("ctfBefore", e.target.value as Profile["ctfBefore"])}>
                      <option value="">Prefiero no responder</option>
                      <option value="yes">Sí</option>
                      <option value="no">No</option>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="prog" optional>Experiencia previa en programación</Label>
                    <Select id="prog" value={profile.programmingExperience} onChange={(e) => set("programmingExperience", e.target.value)}>
                      <option value="">Selecciona…</option>
                      {EXPERIENCE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="sec" optional>Experiencia en ciberseguridad</Label>
                    <Select id="sec" value={profile.securityExperience} onChange={(e) => set("securityExperience", e.target.value)}>
                      <option value="">Selecciona…</option>
                      {EXPERIENCE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </Select>
                  </div>
                </fieldset>

                <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                  <label htmlFor="website_url_f">Sitio web</label>
                  <input ref={honeypot} id="website_url_f" name="website_url" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
                      checked={profile.privacyAccepted}
                      onChange={(e) => set("privacyAccepted", e.target.checked)}
                      disabled={submitting}
                    />
                    <span className="text-slate-700">
                      He leído y acepto el{" "}
                      <Link href="/privacidad" target="_blank" className="font-semibold text-brand-700 underline-offset-2 hover:underline">aviso de privacidad</Link>.
                    </span>
                  </label>
                  <p className="mt-2 pl-7 text-xs text-slate-500">Los datos proporcionados serán utilizados únicamente para administrar tu participación en los talleres.</p>
                  <FieldError>{err("privacyAccepted")}</FieldError>
                </div>

                {formError && <Alert tone={formError.tone} title={formError.title}>{formError.text}{formError.title === "Tiempo de espera agotado" && <> <Link href="/mi-inscripcion" className="font-semibold underline">Consultar mi estado</Link></>}</Alert>}
                {challenge && <Turnstile siteKey={challenge} onToken={setTurnstileToken} />}

                <Button type="submit" size="lg" className="w-full" disabled={submitting || (mode === "register" && reserving)}>
                  {submitting ? (
                    <>
                      <Spinner className="h-4 w-4" /> {mode === "waitlist" ? "Registrando en lista de espera..." : "Procesando inscripción..."}
                    </>
                  ) : mode === "waitlist" ? (
                    "UNIRME A LISTA DE ESPERA"
                  ) : (
                    "CONFIRMAR INSCRIPCIÓN"
                  )}
                </Button>
              </>
            )}
          </form>
        )}
      </section>

      <aside className="card h-fit p-6 lg:sticky lg:top-24">
        <p className="eyebrow">Resumen</p>
        <h2 className="mt-2 font-bold text-slate-900">{workshop.name}</h2>
        <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
          <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-slate-400" />{formatWorkshopDate(workshop.date, true)}</li>
          <li className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" />{workshop.startTime} – {workshop.endTime}</li>
          <li className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-400" />{workshop.location}</li>
        </ul>
        <p className="mt-4 text-xs text-slate-500">Nivel {LEVEL_LABEL[workshop.level] ?? workshop.level} · Instructor: {workshop.instructor}</p>
      </aside>

      <Dialog open={step === "form" && session.warning} onClose={() => void session.keepAlive()} title="Tu sesión está por expirar." description={`Por inactividad cerraremos el formulario en ${session.remaining ?? 0} segundos y liberaremos tu lugar.`}>
        <Button className="w-full" onClick={() => void session.keepAlive()}>CONTINUAR SESIÓN</Button>
      </Dialog>
    </div>
  );
}
