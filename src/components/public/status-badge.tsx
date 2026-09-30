import { Badge } from "@/components/ui/badge";
import { PUBLIC_STATUS_LABEL, type PublicStatus } from "@/lib/workshop-status";

const TONE: Record<PublicStatus, "green" | "amber" | "red" | "gray" | "blue"> = {
  DISPONIBLE: "green",
  POCOS_LUGARES: "amber",
  CUPO_LLENO: "red",
  CERRADO: "gray",
  PROXIMAMENTE: "blue",
};

export function PublicStatusBadge({ status }: { status: PublicStatus }) {
  return (
    <Badge tone={TONE[status]} dot>
      {PUBLIC_STATUS_LABEL[status]}
    </Badge>
  );
}
