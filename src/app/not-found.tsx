import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center">
      <p className="eyebrow">Error 404</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Página no encontrada</h1>
      <p className="mt-2 text-slate-500">El recurso que buscas no existe o ya no está disponible.</p>
      <Link href="/" className={buttonVariants({ className: "mt-6" })}>Volver al inicio</Link>
    </div>
  );
}
