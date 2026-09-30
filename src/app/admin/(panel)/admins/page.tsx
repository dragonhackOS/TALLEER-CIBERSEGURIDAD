"use client";

import * as React from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { useAdmin } from "@/components/admin/admin-context";
import { Loading, PageHeader, useApiData } from "@/components/admin/ui";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, fieldErrors } from "@/lib/api-client";
import { formatDateTimeLong, ROLE_LABEL } from "@/lib/format";

interface A { id: string; email: string; name: string; role: string; active: boolean; totpEnabled: boolean; lastLoginAt: string | null; activeSessions: number }
const ROLES = ["SUPER_ADMIN", "ADMIN", "INSTRUCTOR", "CHECKIN_STAFF", "VIEWER"];

export default function AdminsPage() {
  const me = useAdmin();
  const toast = useToast();
  const { data, loading, reload } = useApiData<{ admins: A[] }>("/api/admin/admins");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ email: "", name: "", role: "VIEWER", password: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function create() {
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      await api("/api/admin/admins", { body: form });
      toast({ tone: "success", title: "Administrador creado" });
      setOpen(false);
      setForm({ email: "", name: "", role: "VIEWER", password: "" });
      await reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function patch(a: A, body: Record<string, unknown>, msg: string) {
    try {
      await api(`/api/admin/admins/${a.id}`, { method: "PATCH", body });
      toast({ tone: "success", title: msg });
      await reload();
    } catch (err) {
      toast({ tone: "error", title: "No se pudo actualizar", description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <>
      <PageHeader eyebrow="Seguridad" title="Administradores" description="Control de acceso basado en roles (RBAC)." actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo</Button>} />
      <div className="card overflow-hidden">
        {loading && !data ? <Loading /> : (
          <Table>
            <thead><tr><Th>Nombre</Th><Th>Rol</Th><Th>Estado</Th><Th>2FA</Th><Th>Último acceso</Th><Th>Sesiones</Th><Th /></tr></thead>
            <tbody>
              {data?.admins.map((a) => (
                <tr key={a.id}>
                  <Td><p className="font-semibold text-slate-900">{a.name}{a.id === me.id && <span className="ml-2 text-xs font-normal text-slate-400">(tú)</span>}</p><p className="text-xs text-slate-500">{a.email}</p></Td>
                  <Td>
                    <Select className="h-9 w-48 text-sm" value={a.role} disabled={a.id === me.id} onChange={(e) => patch(a, { role: e.target.value }, "Rol actualizado")}>
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </Select>
                  </Td>
                  <Td>{a.active ? <Badge tone="green">Activo</Badge> : <Badge tone="gray">Inactivo</Badge>}</Td>
                  <Td>{a.totpEnabled ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <span className="text-slate-400">—</span>}</Td>
                  <Td className="text-xs">{a.lastLoginAt ? formatDateTimeLong(a.lastLoginAt) : "Nunca"}</Td>
                  <Td className="tabular">{a.activeSessions}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {a.id !== me.id && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => patch(a, { revokeSessions: true }, "Sesiones revocadas")}>Revocar sesiones</Button>
                        <Button size="sm" variant={a.active ? "danger-outline" : "secondary"} onClick={() => patch(a, { active: !a.active }, a.active ? "Cuenta desactivada" : "Cuenta activada")}>{a.active ? "Desactivar" : "Activar"}</Button>
                      </>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Nuevo administrador" description="La contraseña debe tener 12+ caracteres y combinar mayúsculas, minúsculas, números o símbolos.">
        <div className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div><Label htmlFor="n">Nombre</Label><Input id="n" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} invalid={!!errors.name} /><FieldError>{errors.name}</FieldError></div>
          <div><Label htmlFor="e">Correo</Label><Input id="e" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} invalid={!!errors.email} /><FieldError>{errors.email}</FieldError></div>
          <div><Label htmlFor="r">Rol</Label><Select id="r" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></div>
          <div><Label htmlFor="p">Contraseña temporal</Label><Input id="p" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} invalid={!!errors.password} /><FieldError>{errors.password}</FieldError></div>
          <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={busy} onClick={create}>Crear</Button></div>
        </div>
      </Dialog>
    </>
  );
}
