"use client";

import * as React from "react";
import { Loading, PageHeader, Pagination, useApiData } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { formatDateTimeLong } from "@/lib/format";

interface Item { id: string; action: string; actorType: string; admin: { name: string; email: string } | null; resourceType: string | null; resourceId: string | null; metadata: unknown; ipHash: string | null; createdAt: string }

export default function AuditPage() {
  const [action, setAction] = React.useState("");
  const [page, setPage] = React.useState(1);
  const qs = new URLSearchParams({ page: String(page), ...(action ? { action } : {}) });
  const { data, loading } = useApiData<{ total: number; page: number; pages: number; actions: string[]; items: Item[] }>(`/api/admin/audit?${qs}`);
  return (
    <>
      <PageHeader eyebrow="Trazabilidad" title="Auditoría" description="Bitácora inmutable: los registros no pueden modificarse ni eliminarse." />
      <div className="card overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <Select className="h-10 max-w-xs" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
            <option value="">Todas las acciones</option>
            {data?.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </div>
        {loading && !data ? <Loading /> : (
          <Table>
            <thead><tr><Th>Fecha</Th><Th>Acción</Th><Th>Actor</Th><Th>Recurso</Th><Th>Detalle</Th><Th>IP (hash)</Th></tr></thead>
            <tbody>
              {data?.items.length === 0 && <EmptyRow colSpan={6}>Sin registros.</EmptyRow>}
              {data?.items.map((i) => (
                <tr key={i.id} className="align-top">
                  <Td className="whitespace-nowrap text-xs tabular">{formatDateTimeLong(i.createdAt)}</Td>
                  <Td><Badge tone={i.action.includes("FAILED") ? "red" : i.action.includes("CANCEL") ? "amber" : "blue"}>{i.action}</Badge></Td>
                  <Td className="text-xs">{i.admin ? <><p className="font-semibold text-slate-800">{i.admin.name}</p><p className="text-slate-500">{i.admin.email}</p></> : <span className="text-slate-500">{i.actorType === "STUDENT" ? "Estudiante" : "Sistema"}</span>}</Td>
                  <Td className="text-xs">{i.resourceType}<p className="font-mono text-[10px] text-slate-400">{i.resourceId}</p></Td>
                  <Td className="max-w-xs"><code className="block truncate text-[11px] text-slate-500" title={JSON.stringify(i.metadata)}>{i.metadata ? JSON.stringify(i.metadata) : "—"}</code></Td>
                  <Td className="font-mono text-[10px] text-slate-400">{i.ipHash?.slice(0, 12) ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      </div>
    </>
  );
}
