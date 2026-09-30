"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Loading, PageHeader, Pagination, RegistrationStatusBadge, useApiData } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { EmptyRow, Table, Td, Th } from "@/components/ui/table";

interface S {
  id: string; fullName: string; email: string; classroom: string | null; semester: number | null; phone: string | null; ctfBefore: boolean | null;
  registrations: { id: string; status: string; registrationCode: string; workshop: { name: string } }[];
  waitlist: { id: string; workshop: { name: string } }[];
}

export default function StudentsPage() {
  const [q, setQ] = React.useState("");
  const [dq, setDq] = React.useState("");
  const [semester, setSemester] = React.useState("");
  const [page, setPage] = React.useState(1);
  React.useEffect(() => { const t = setTimeout(() => { setDq(q); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  const qs = new URLSearchParams({ page: String(page), ...(dq ? { q: dq } : {}), ...(semester ? { semester } : {}) });
  const { data, loading } = useApiData<{ total: number; page: number; pages: number; items: S[] }>(`/api/admin/students?${qs}`);
  return (
    <>
      <PageHeader eyebrow="Gestión" title="Estudiantes" description="Alumnos que han completado su registro." />
      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="h-10 pl-9" placeholder="Nombre, correo o salón" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select className="h-10 sm:w-40" value={semester} onChange={(e) => { setSemester(e.target.value); setPage(1); }}><option value="">Semestre</option>{[1, 2, 3, 4, 5, 6].map((s) => <option key={s} value={s}>{s}°</option>)}</Select>
        </div>
        {loading && !data ? <Loading /> : (
          <Table>
            <thead><tr><Th>Nombre</Th><Th>Correo</Th><Th>Salón</Th><Th>Sem.</Th><Th>Inscripciones</Th><Th>Lista de espera</Th></tr></thead>
            <tbody>
              {data?.items.length === 0 && <EmptyRow colSpan={6}>Sin resultados.</EmptyRow>}
              {data?.items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <Td className="font-semibold text-slate-900">{s.fullName}</Td>
                  <Td className="text-slate-500">{s.email}</Td>
                  <Td>{s.classroom}</Td>
                  <Td>{s.semester}</Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      {s.registrations.length === 0 && <span className="text-slate-400">—</span>}
                      {s.registrations.map((r) => (
                        <Link key={r.id} href={`/admin/registrations/${r.id}`} className="flex items-center gap-2 hover:underline"><span className="text-sm">{r.workshop.name}</span><RegistrationStatusBadge status={r.status} /></Link>
                      ))}
                    </div>
                  </Td>
                  <Td>{s.waitlist.map((w) => <Badge key={w.id} tone="violet">{w.workshop.name}</Badge>)}</Td>
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
