"use client";

import * as React from "react";
import { api } from "@/lib/api-client";
import { WorkshopCard, type PublicWorkshop } from "./workshop-card";

/** Catálogo con actualización automática de cupos (cada 15 s y al volver a la pestaña). */
export function WorkshopGrid({ initial }: { initial: PublicWorkshop[] }) {
  const [workshops, setWorkshops] = React.useState(initial);
  React.useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ workshops: PublicWorkshop[] }>("/api/workshops")
        .then((d) => alive && setWorkshops(d.workshops))
        .catch(() => undefined);
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  if (workshops.length === 0) {
    return (
      <div className="card p-10 text-center">
        <p className="font-semibold text-slate-800">Aún no hay talleres publicados</p>
        <p className="mt-1 text-sm text-slate-500">Vuelve pronto: aquí aparecerán los talleres disponibles.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {workshops.map((w) => (
        <WorkshopCard key={w.id} w={w} />
      ))}
    </div>
  );
}
