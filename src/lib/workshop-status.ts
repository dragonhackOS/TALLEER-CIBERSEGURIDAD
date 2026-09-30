/** Estado visual público de un taller (derivado SIEMPRE en el servidor). */
export type PublicStatus = "DISPONIBLE" | "POCOS_LUGARES" | "CUPO_LLENO" | "CERRADO" | "PROXIMAMENTE";

export const PUBLIC_STATUS_LABEL: Record<PublicStatus, string> = {
  DISPONIBLE: "Disponible",
  POCOS_LUGARES: "Pocos lugares",
  CUPO_LLENO: "Cupo lleno",
  CERRADO: "Cerrado",
  PROXIMAMENTE: "Próximamente",
};

export function computePublicStatus(input: {
  status: string;
  maxCapacity: number;
  registeredCount: number;
  heldSeats: number;
  registrationOpensAt?: Date | string | null;
  registrationClosesAt?: Date | string | null;
  now?: Date;
}): { status: PublicStatus; available: number } {
  const now = input.now ?? new Date();
  const available = Math.max(0, input.maxCapacity - input.registeredCount - input.heldSeats);
  if (["CLOSED", "CANCELLED", "FINISHED"].includes(input.status)) return { status: "CERRADO", available };
  if (input.status === "DRAFT") return { status: "PROXIMAMENTE", available };
  if (input.registrationOpensAt && new Date(input.registrationOpensAt) > now) return { status: "PROXIMAMENTE", available };
  if (input.registrationClosesAt && new Date(input.registrationClosesAt) < now) return { status: "CERRADO", available };
  if (available <= 0 || input.status === "FULL") return { status: "CUPO_LLENO", available: 0 };
  const fewThreshold = Math.max(3, Math.ceil(input.maxCapacity * 0.2));
  if (available <= fewThreshold) return { status: "POCOS_LUGARES", available };
  return { status: "DISPONIBLE", available };
}
