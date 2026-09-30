"use client";

import * as React from "react";
import { useCan } from "@/components/admin/admin-context";
import { Loading, PageHeader, useApiData, useRealtime } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { formatDateTimeLong } from "@/lib/format";

interface E { id: string; position: number; createdAt: string; student: { fullName: string; email: string; classroom: string; semester: number }; workshop: { id: string; name: string } }

export default function WaitlistPage() {
  const canWrite = useCan("waitlist:write");
  const toast = useToast();
  const [workshopId, setWorkshopId] = React.useState("");
  const { data, loading, reload } = useApiData<{ entries: E[] }>(`/api/admin/waitlist${workshopId ? `?workshopId=${workshopId}` : ""}`);
  const { data: ws } = useApiData<{ workshops: { id: string; name: string }[] }>("/api/admin/workshops");
  useRealtime(() => void reload());

  async function remove(e: E) {
    try {
      await api(`/api/admin/waitlist/${e.id}`, { method: "DELETE" });
      toast({ tone: "success", title: "Alumno retirado de la lista" });
      await reload();
    } catch (err) {
      toast({ tone: "error", title: "Error", description: err instanceof Error ? err.message : undefined });
    }
  }

  return (
    <>
      <PageHeader eyebrow="Gestión" title="Lista de espera" description="Cuando se libera un lugar, el primero de la lista se inscribe automáticamente." />
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <Select className="h-10 max-w-xs" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
            <option value="">Todos los talleres</option>
            {ws?.workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
        </div>
        {loading && !data ? <Loading /> : (
          <Table>
            <thead><tr><Th>#</Th><Th>Taller</Th><Th>Nombre</Th><Th>Correo</Th><Th>Salón</Th><Th>Sem.</Th><Th>Desde</Th>{canWrite && <Th />}</tr></thead>
            <tbody>
              {data?.entries.length === 0 && <EmptyRow colSpan={8}>No hay alumnos en lista de espera.</EmptyRow>}
              {data?.entries.map((e) => (
                <tr key={e.id}>
                  <Td className="font-bold tabular">{e.position}</Td>
                  <Td>{e.workshop.name}</Td>
                  <Td className="font-semibold text-slate-900">{e.student.fullName}</Td>
                  <Td className="text-slate-500">{e.student.email}</Td>
                  <Td>{e.student.classroom}</Td>
                  <Td>{e.student.semester}</Td>
                  <Td className="text-xs">{formatDateTimeLong(e.createdAt)}</Td>
                  {canWrite && <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => remove(e)}>Retirar</Button></Td>}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}
