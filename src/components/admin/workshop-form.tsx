"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ICON_OPTIONS, WorkshopIcon } from "@/components/public/workshop-icon";
import { api, fieldErrors } from "@/lib/api-client";

export interface WorkshopFormValues {
  name: string;
  slug: string;
  description: string;
  instructorName: string;
  instructorAdminId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  level: string;
  maxCapacity: string;
  imageUrl: string;
  icon: string;
  codePrefix: string;
  eventKey: string;
  status: string;
}

export const EMPTY_WORKSHOP: WorkshopFormValues = {
  name: "", slug: "", description: "", instructorName: "", instructorAdminId: "", date: "", startTime: "10:00", endTime: "13:00",
  location: "", level: "PRINCIPIANTE", maxCapacity: "25", imageUrl: "", icon: "terminal", codePrefix: "", eventKey: "default", status: "DRAFT",
};

const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export function WorkshopForm({ initial, workshopId, registered = 0 }: { initial: WorkshopFormValues; workshopId?: string; registered?: number }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [instructors, setInstructors] = React.useState<{ id: string; name: string }[]>([]);
  const slugTouched = React.useRef(!!workshopId);

  React.useEffect(() => {
    api<{ instructors: { id: string; name: string }[] }>("/api/admin/instructors").then((d) => setInstructors(d.instructors)).catch(() => undefined);
  }, []);

  const set = (k: keyof WorkshopFormValues, val: string) =>
    setV((p) => ({ ...p, [k]: val, ...(k === "name" && !slugTouched.current ? { slug: slugify(val) } : {}) }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    const body: Record<string, unknown> = {
      name: v.name, slug: v.slug, description: v.description, instructorName: v.instructorName,
      instructorAdminId: v.instructorAdminId || null, date: v.date, startTime: v.startTime, endTime: v.endTime,
      location: v.location, level: v.level, maxCapacity: Number(v.maxCapacity), imageUrl: v.imageUrl || null, icon: v.icon || null,
      ...(v.codePrefix ? { codePrefix: v.codePrefix } : {}), ...(v.eventKey ? { eventKey: v.eventKey } : {}),
    };
    try {
      if (workshopId) {
        await api(`/api/admin/workshops/${workshopId}`, { method: "PATCH", body });
        toast({ tone: "success", title: "Taller actualizado" });
        router.refresh();
      } else {
        const r = await api<{ workshop: { id: string } }>("/api/admin/workshops", { body: { ...body, status: v.status } });
        toast({ tone: "success", title: "Taller creado" });
        router.push(`/admin/workshops/${r.workshop.id}`);
      }
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const f = (k: keyof WorkshopFormValues) => errors[k];

  return (
    <form onSubmit={submit} className="card space-y-6 p-6" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-5 md:grid-cols-2">
        <div><Label htmlFor="name">Nombre</Label><Input id="name" value={v.name} onChange={(e) => set("name", e.target.value)} invalid={!!f("name")} /><FieldError>{f("name")}</FieldError></div>
        <div><Label htmlFor="slug">Slug (URL)</Label><Input id="slug" value={v.slug} onChange={(e) => { slugTouched.current = true; set("slug", e.target.value); }} invalid={!!f("slug")} /><FieldError>{f("slug")}</FieldError></div>
        <div className="md:col-span-2"><Label htmlFor="desc">Descripción</Label><Textarea id="desc" rows={4} value={v.description} onChange={(e) => set("description", e.target.value)} invalid={!!f("description")} /><FieldError>{f("description")}</FieldError></div>
        <div><Label htmlFor="inst">Instructor (nombre visible)</Label><Input id="inst" value={v.instructorName} onChange={(e) => set("instructorName", e.target.value)} invalid={!!f("instructorName")} /><FieldError>{f("instructorName")}</FieldError></div>
        <div>
          <Label htmlFor="instAdmin" optional>Cuenta de instructor asignada</Label>
          <Select id="instAdmin" value={v.instructorAdminId} onChange={(e) => set("instructorAdminId", e.target.value)}>
            <option value="">Sin asignar</option>
            {instructors.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </Select>
        </div>
        <div><Label htmlFor="date">Fecha</Label><Input id="date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} invalid={!!f("date")} /><FieldError>{f("date")}</FieldError></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="st">Hora inicio</Label><Input id="st" type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} invalid={!!f("startTime")} /></div>
          <div><Label htmlFor="et">Hora final</Label><Input id="et" type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} invalid={!!f("endTime")} /><FieldError>{f("endTime")}</FieldError></div>
        </div>
        <div><Label htmlFor="loc">Lugar</Label><Input id="loc" value={v.location} onChange={(e) => set("location", e.target.value)} invalid={!!f("location")} /><FieldError>{f("location")}</FieldError></div>
        <div>
          <Label htmlFor="lvl">Nivel</Label>
          <Select id="lvl" value={v.level} onChange={(e) => set("level", e.target.value)}>
            <option value="PRINCIPIANTE">Principiante</option><option value="INTERMEDIO">Intermedio</option><option value="AVANZADO">Avanzado</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="cap">Capacidad máxima</Label>
          <Input id="cap" type="number" min={Math.max(1, registered)} value={v.maxCapacity} onChange={(e) => set("maxCapacity", e.target.value)} invalid={!!f("maxCapacity")} />
          {workshopId && <p className="mt-1.5 text-xs text-slate-500">Inscritos actuales: {registered}. No puede ser menor.</p>}
          <FieldError>{f("maxCapacity")}</FieldError>
        </div>
        {!workshopId && (
          <div>
            <Label htmlFor="status">Estado inicial</Label>
            <Select id="status" value={v.status} onChange={(e) => set("status", e.target.value)}>
              <option value="DRAFT">Borrador</option><option value="OPEN">Abierto</option><option value="CLOSED">Cerrado</option>
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="icon">Icono</Label>
          <div className="flex items-center gap-3">
            <WorkshopIcon icon={v.icon} imageUrl={v.imageUrl || null} className="h-11 w-11" />
            <Select id="icon" value={v.icon} onChange={(e) => set("icon", e.target.value)}>
              {ICON_OPTIONS.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          </div>
        </div>
        <div><Label htmlFor="img" optional>Imagen (ruta /… o URL https://)</Label><Input id="img" value={v.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} invalid={!!f("imageUrl")} /><FieldError>{f("imageUrl")}</FieldError></div>
        <div><Label htmlFor="cp" optional>Prefijo del código</Label><Input id="cp" maxLength={6} placeholder="CTF" value={v.codePrefix} onChange={(e) => set("codePrefix", e.target.value.toUpperCase())} invalid={!!f("codePrefix")} /><FieldError>{f("codePrefix")}</FieldError></div>
        <div><Label htmlFor="ev" optional>Evento (agrupa talleres; 1 inscripción por evento)</Label><Input id="ev" value={v.eventKey} onChange={(e) => set("eventKey", e.target.value.toLowerCase())} invalid={!!f("eventKey")} /></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-5">
        <Button type="button" variant="secondary" onClick={() => router.push("/admin/workshops")}>Cancelar</Button>
        <Button type="submit" loading={saving}>{workshopId ? "Guardar cambios" : "Crear taller"}</Button>
      </div>
    </form>
  );
}
