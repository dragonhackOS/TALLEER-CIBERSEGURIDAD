"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Loading, PageHeader, useApiData, WorkshopStatusBadge } from "@/components/admin/ui";
import { WorkshopForm, type WorkshopFormValues } from "@/components/admin/workshop-form";
import { useCan } from "@/components/admin/admin-context";
import { Alert } from "@/components/ui/alert";

interface W {
  id: string; name: string; slug: string; description: string; instructorName: string; instructorAdminId: string | null; date: string; startTime: string; endTime: string;
  location: string; level: string; maxCapacity: number; registeredCount: number; imageUrl: string | null; icon: string | null; codePrefix: string; eventKey: string; status: string;
}

export default function EditWorkshopPage() {
  const { id } = useParams<{ id: string }>();
  const canWrite = useCan("workshops:write");
  const { data, error } = useApiData<{ workshop: W }>(`/api/admin/workshops/${id}`);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Loading />;
  const w = data.workshop;
  const initial: WorkshopFormValues = {
    name: w.name, slug: w.slug, description: w.description, instructorName: w.instructorName, instructorAdminId: w.instructorAdminId ?? "", date: w.date,
    startTime: w.startTime, endTime: w.endTime, location: w.location, level: w.level, maxCapacity: String(w.maxCapacity), imageUrl: w.imageUrl ?? "",
    icon: w.icon ?? "terminal", codePrefix: w.codePrefix, eventKey: w.eventKey, status: w.status,
  };
  return (
    <>
      <PageHeader eyebrow="Talleres" title={w.name} description={`${w.registeredCount} / ${w.maxCapacity} inscritos`} actions={<WorkshopStatusBadge status={w.status} />} />
      {canWrite ? <WorkshopForm initial={initial} workshopId={w.id} registered={w.registeredCount} /> : <Alert tone="info">Tienes acceso de solo lectura.</Alert>}
    </>
  );
}
