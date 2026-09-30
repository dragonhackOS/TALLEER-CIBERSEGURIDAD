import { PageHeader } from "@/components/admin/ui";
import { EMPTY_WORKSHOP, WorkshopForm } from "@/components/admin/workshop-form";

export default function NewWorkshopPage() {
  return (
    <>
      <PageHeader eyebrow="Talleres" title="Nuevo taller" />
      <WorkshopForm initial={EMPTY_WORKSHOP} />
    </>
  );
}
