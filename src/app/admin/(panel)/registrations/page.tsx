"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Download, Search } from "lucide-react";
import { useCan } from "@/components/admin/admin-context";
import { Loading, PageHeader, Pagination, RegistrationStatusBadge, useApiData, useRealtime } from "@/components/admin/ui";
import { buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";

interface Row {
  id: string; code: string; status: string; createdAt: string; source: string; checkedInAt: string | null;
  student: { fullName: string | null; email: string; classroom: string | null; semester: number | null };
  workshop: { id: string; name: string };
}
interface ListResp { total: number; page: number; pages: number; items: Row[] }

export default function RegistrationsPage() {
  return <React.Suspense fallback={<Loading />}><Inner /></React.Suspense>;
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const canExport = useCan("exports:create");
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [debounced, setDebounced] = React.useState(q);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filters = {
    workshopId: params.get("workshopId") ?? "",
    semester: params.get("semester") ?? "",
    status: params.get("status") ?? "",
    date: params.get("date") ?? "",
    attendance: params.get("attendance") ?? "",
    sort: params.get("sort") ?? "createdAt",
    dir: params.get("dir") ?? "desc",
    page: params.get("page") ?? "1",
  };
  const setFilter = (k: string, v: string) => {
    const sp = new URLSearchParams(params.toString());
    if (v) sp.set(k, v); else sp.delete(k);
    if (k !== "page") sp.delete("page");
    router.replace(`/admin/registrations?${sp.toString()}`);
  };

  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(debounced ? { q: debounced } : {}) }).toString();
  const { data, loading, reload } = useApiData<ListResp>(`/api/admin/registrations?${qs}`);
  const { data: ws } = useApiData<{ workshops: { id: string; name: string }[] }>("/api/admin/workshops");
  useRealtime(() => void reload());

  const sortBy = (col: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("sort", col);
    sp.set("dir", filters.sort === col && filters.dir === "asc" ? "desc" : "asc");
    router.replace(`/admin/registrations?${sp.toString()}`);
  };
  const SortIcon = ({ col }: { col: string }) => (filters.sort === col ? (filters.dir === "asc" ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />) : null);

  return (
    <>
      <PageHeader
        eyebrow="Gestión"
        title="Inscripciones"
        description="Busca, filtra y administra las inscripciones."
        actions={canExport && <Link className={buttonVariants({ size: "sm", variant: "secondary" })} href={`/api/admin/exports?format=xlsx&scope=${filters.workshopId ? "workshop" : "all"}${filters.workshopId ? `&workshopId=${filters.workshopId}` : ""}`} prefetch={false}><Download className="h-4 w-4" /> Exportar XLSX</Link>}
      />
      <div className="card overflow-hidden">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-3 xl:grid-cols-6">
          <div className="relative md:col-span-3 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input placeholder="Nombre, correo, código, salón o taller" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" />
          </div>
          <Select className="h-10" value={filters.workshopId} onChange={(e) => setFilter("workshopId", e.target.value)} aria-label="Taller">
            <option value="">Todos los talleres</option>
            {ws?.workshops.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </Select>
          <Select className="h-10" value={filters.status} onChange={(e) => setFilter("status", e.target.value)} aria-label="Estado">
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activas</option><option value="REGISTERED">Inscrito</option><option value="CHECKED_IN">Asistió</option><option value="NO_SHOW">No asistió</option><option value="CANCELLED">Cancelada</option>
          </Select>
          <Select className="h-10" value={filters.semester} onChange={(e) => setFilter("semester", e.target.value)} aria-label="Semestre">
            <option value="">Semestre</option>{[1, 2, 3, 4, 5, 6].map((s) => <option key={s} value={s}>{s}°</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" className="h-10 px-2 text-sm" value={filters.date} onChange={(e) => setFilter("date", e.target.value)} aria-label="Fecha" />
            <Select className="h-10" value={filters.attendance} onChange={(e) => setFilter("attendance", e.target.value)} aria-label="Asistencia">
              <option value="">Asistencia</option><option value="yes">Sí</option><option value="no">No</option>
            </Select>
          </div>
        </div>
        {loading && !data ? <Loading /> : (
          <Table>
            <thead>
              <tr>
                <Th><button onClick={() => sortBy("name")}>Nombre <SortIcon col="name" /></button></Th>
                <Th>Correo</Th><Th>Salón</Th><Th>Sem.</Th>
                <Th><button onClick={() => sortBy("workshop")}>Taller <SortIcon col="workshop" /></button></Th>
                <Th>Estado</Th>
                <Th><button onClick={() => sortBy("createdAt")}>Fecha <SortIcon col="createdAt" /></button></Th>
                <Th>Hora</Th>
                <Th><button onClick={() => sortBy("code")}>Código <SortIcon col="code" /></button></Th>
                <Th>Asistencia</Th><Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {data?.items.length === 0 && <EmptyRow colSpan={11}>No se encontraron inscripciones con esos filtros.</EmptyRow>}
              {data?.items.map((r) => {
                const { date, time } = formatDateTime(r.createdAt);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <Td className="whitespace-nowrap font-semibold text-slate-900">{r.student.fullName}</Td>
                    <Td className="text-slate-500">{r.student.email}</Td>
                    <Td>{r.student.classroom}</Td>
                    <Td className="tabular">{r.student.semester}</Td>
                    <Td className="whitespace-nowrap">{r.workshop.name}</Td>
                    <Td><RegistrationStatusBadge status={r.status} /></Td>
                    <Td className="tabular">{date}</Td>
                    <Td className="tabular">{time}</Td>
                    <Td className="whitespace-nowrap font-mono text-xs font-semibold">{r.code}</Td>
                    <Td className="tabular text-xs">{r.checkedInAt ? formatDateTime(r.checkedInAt).time : "—"}</Td>
                    <Td className="text-right"><Link href={`/admin/registrations/${r.id}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>Ver</Link></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setFilter("page", String(p))} />}
      </div>
    </>
  );
}
