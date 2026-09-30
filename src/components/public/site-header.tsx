import Link from "next/link";

export function SiteHeader({ schoolName, logoUrl }: { schoolName: string; logoUrl: string }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md no-print">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          {/* Espacio configurable para el logo oficial (Configuración → Marca, o LOGO_URL). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={`Logo ${schoolName}`} className="h-9 w-9 shrink-0 rounded-lg object-contain" />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-bold tracking-[0.08em] text-slate-900">{schoolName}</p>
            <p className="text-xs font-medium text-brand-700">Talleres</p>
          </div>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/#talleres" className="hidden rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:block">
            Talleres
          </Link>
          <Link href="/mi-inscripcion" className="rounded-lg px-3 py-2 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
            Mi inscripción
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ schoolName }: { schoolName: string }) {
  return (
    <footer className="mt-20 border-t border-slate-200 bg-white no-print">
      <div className="container flex flex-col gap-3 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} {schoolName} · Plataforma de talleres</p>
        <div className="flex gap-4">
          <Link href="/privacidad" className="hover:text-slate-800">Aviso de privacidad</Link>
          <Link href="/mi-inscripcion" className="hover:text-slate-800">Consultar mi inscripción</Link>
        </div>
      </div>
    </footer>
  );
}
