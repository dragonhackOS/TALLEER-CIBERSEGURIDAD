"use client";

import * as React from "react";
import { Camera, CameraOff, CheckCircle2, Hash, Search, TriangleAlert, XCircle } from "lucide-react";
import { PageHeader, RegistrationStatusBadge, useApiData } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Result =
  | { kind: "ok"; name: string; workshop: string; code: string; at: string; extra: string }
  | { kind: "already"; name: string; workshop: string; code: string; at: string }
  | { kind: "error"; message: string };

interface CheckinResponse { result: { studentName: string; workshopName: string; code: string; checkedInAt: string; classroom: string | null; semester: number | null } }

export default function CheckinPage() {
  const { data: ws } = useApiData<{ workshops: { id: string; name: string; archived: boolean }[] }>("/api/admin/workshops");
  const [workshopId, setWorkshopId] = React.useState("");
  const [result, setResult] = React.useState<Result | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [q, setQ] = React.useState("");
  const [matches, setMatches] = React.useState<{ id: string; code: string; status: string; studentName: string; email: string; classroom: string; workshopName: string; checkedInAt: string | null }[]>([]);
  const scannerRef = React.useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const busy = React.useRef(false);
  const lastToken = React.useRef<{ t: string; at: number } | null>(null);

  const submit = React.useCallback(async (body: Record<string, string>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await api<CheckinResponse>("/api/admin/checkin", { body: { ...body, ...(workshopId ? { workshopId } : {}) } });
      setResult({ kind: "ok", name: r.result.studentName, workshop: r.result.workshopName, code: r.result.code, at: r.result.checkedInAt, extra: `Salón ${r.result.classroom ?? "—"} · ${r.result.semester ?? "—"}° semestre` });
      if ("vibrate" in navigator) navigator.vibrate(80);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ALREADY_CHECKED_IN") {
        const r = (err.details?.result ?? {}) as CheckinResponse["result"];
        setResult({ kind: "already", name: r.studentName, workshop: r.workshopName, code: r.code, at: r.checkedInAt });
      } else setResult({ kind: "error", message: err instanceof Error ? err.message : "Error" });
    } finally {
      busy.current = false;
      if (q.length >= 2) void search(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workshopId, q]);

  async function startScanner() {
    setResult(null);
    const { Html5Qrcode } = await import("html5-qrcode");
    const scanner = new Html5Qrcode("qr-reader", { verbose: false });
    scannerRef.current = scanner as unknown as { stop: () => Promise<void>; clear: () => void };
    setScanning(true);
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (text) => {
          // Evita procesar el mismo QR varias veces por segundo.
          const now = Date.now();
          if (lastToken.current && lastToken.current.t === text && now - lastToken.current.at < 3000) return;
          lastToken.current = { t: text, at: now };
          void submit({ token: text });
        },
        () => undefined,
      );
    } catch {
      setScanning(false);
      setResult({ kind: "error", message: "No se pudo acceder a la cámara. Verifica permisos (se requiere HTTPS o localhost)." });
    }
  }

  async function stopScanner() {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {
      /* noop */
    }
    setScanning(false);
  }
  React.useEffect(() => () => void stopScanner(), []);

  async function search(term: string) {
    if (term.trim().length < 2) return setMatches([]);
    const r = await api<{ results: typeof matches }>(`/api/admin/checkin/search?q=${encodeURIComponent(term)}${workshopId ? `&workshopId=${workshopId}` : ""}`).catch(() => ({ results: [] }));
    setMatches(r.results);
  }
  React.useEffect(() => {
    const t = setTimeout(() => void search(q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, workshopId]);

  return (
    <>
      <PageHeader eyebrow="Operación" title="Check-in" description="Escanea el QR, escribe el código o busca al alumno." />
      <div className="mb-5 max-w-sm">
        <Label htmlFor="ws" optional>Taller en curso (valida que el QR corresponda)</Label>
        <Select id="ws" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
          <option value="">Cualquier taller</option>
          {ws?.workshops.filter((w) => !w.archived).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </div>

      {result && (
        <div
          role="status"
          className={cn(
            "mb-5 flex items-start gap-4 rounded-2xl border p-5 animate-fade-in",
            result.kind === "ok" && "border-emerald-200 bg-emerald-50",
            result.kind === "already" && "border-amber-200 bg-amber-50",
            result.kind === "error" && "border-red-200 bg-red-50",
          )}
        >
          {result.kind === "ok" && <CheckCircle2 className="h-9 w-9 shrink-0 text-emerald-600" />}
          {result.kind === "already" && <TriangleAlert className="h-9 w-9 shrink-0 text-amber-600" />}
          {result.kind === "error" && <XCircle className="h-9 w-9 shrink-0 text-red-600" />}
          <div>
            {result.kind === "ok" && (<><p className="text-lg font-bold text-emerald-900">Check-in registrado</p><p className="font-semibold text-slate-900">{result.name}</p><p className="text-sm text-slate-600">{result.workshop} · <span className="font-mono">{result.code}</span> · {formatDateTime(result.at).time}</p><p className="text-xs text-slate-500">{result.extra}</p></>)}
            {result.kind === "already" && <><p className="text-lg font-bold text-amber-900">Este alumno ya realizó check-in.</p><p className="font-semibold text-slate-900">{result.name}</p><p className="text-sm text-slate-700">{result.workshop} · <span className="font-mono">{result.code}</span></p><p className="text-sm font-semibold text-amber-800">Hora del check-in: {result.at ? formatDateTime(result.at).time : "—"}</p></>}
            {result.kind === "error" && <p className="font-semibold text-red-900">{result.message}</p>}
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card p-5">
          <p className="mb-3 flex items-center gap-2 font-semibold"><Camera className="h-4 w-4 text-brand-600" /> Escanear QR</p>
          <div id="qr-reader" className={cn("overflow-hidden rounded-xl bg-slate-900", !scanning && "hidden")} />
          {!scanning ? <Button className="w-full" size="lg" onClick={startScanner}><Camera className="h-4 w-4" /> Activar cámara</Button> : <Button className="mt-3 w-full" variant="secondary" onClick={stopScanner}><CameraOff className="h-4 w-4" /> Detener</Button>}

          <form className="mt-6 border-t border-slate-100 pt-5" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void submit({ code: code.trim() }); }}>
            <Label htmlFor="code"><Hash className="mr-1 inline h-3.5 w-3.5" />Código de inscripción</Label>
            <div className="flex gap-2">
              <Input id="code" className="font-mono uppercase" placeholder="PY-CTF-A82X7Q" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <Button type="submit">Registrar</Button>
            </div>
          </form>
        </div>

        <div className="card p-5">
          <p className="mb-3 flex items-center gap-2 font-semibold"><Search className="h-4 w-4 text-brand-600" /> Buscar alumno</p>
          <Input placeholder="Nombre, correo o código" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="mt-3 divide-y divide-slate-100">
            {matches.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-semibold text-slate-900">{m.studentName}</p>
                  <p className="truncate text-xs text-slate-500">{m.workshopName} · {m.classroom} · <span className="font-mono">{m.code}</span></p>
                </div>
                {m.status === "CHECKED_IN" ? <div className="text-right"><RegistrationStatusBadge status={m.status} />{m.checkedInAt && <p className="mt-1 text-[11px] text-slate-500">{formatDateTime(m.checkedInAt).time}</p>}</div> : <Button size="sm" onClick={() => submit({ registrationId: m.id })}>Check-in</Button>}
              </li>
            ))}
            {q.length >= 2 && matches.length === 0 && <li className="py-4 text-sm text-slate-500">Sin coincidencias.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}

