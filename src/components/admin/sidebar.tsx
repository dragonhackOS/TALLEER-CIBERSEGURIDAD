"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3, BookOpen, CalendarClock, ClipboardCheck, Download, FileSearch, ListOrdered, LogOut, Menu, QrCode, Settings, ShieldCheck, UserCog, Users, X, GraduationCap,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { ROLE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAdmin } from "./admin-context";

const NAV = [
  { href: "/admin", label: "Dashboard", Icon: BarChart3, perm: "dashboard:read" },
  { href: "/admin/workshops", label: "Talleres", Icon: BookOpen, perm: "workshops:read" },
  { href: "/admin/registrations", label: "Inscripciones", Icon: ClipboardCheck, perm: "registrations:read" },
  { href: "/admin/students", label: "Estudiantes", Icon: Users, perm: "students:read" },
  { href: "/admin/waitlist", label: "Lista de espera", Icon: ListOrdered, perm: "waitlist:read" },
  { href: "/admin/attendance", label: "Asistencia", Icon: GraduationCap, perm: "attendance:read" },
  { href: "/admin/checkin", label: "Check-in", Icon: QrCode, perm: "checkin:write" },
  { href: "/admin/schedule", label: "Horarios", Icon: CalendarClock, perm: "workshops:read" },
  { href: "/admin/exports", label: "Exportaciones", Icon: Download, perm: "exports:create" },
  { href: "/admin/audit", label: "Auditoría", Icon: FileSearch, perm: "audit:read" },
  { href: "/admin/admins", label: "Administradores", Icon: UserCog, perm: "admins:manage" },
  { href: "/admin/settings", label: "Configuración", Icon: Settings, perm: "settings:manage" },
];

export function Sidebar({ schoolName, logoUrl }: { schoolName: string; logoUrl: string }) {
  const admin = useAdmin();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [pathname]);

  async function logout() {
    await api("/api/admin/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/admin/login");
    router.refresh();
  }

  const items = NAV.filter((n) => admin.permissions.includes(n.perm));
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg bg-white/10 object-contain p-0.5" />
        <div className="leading-tight">
          <p className="text-[12px] font-bold tracking-[0.1em] text-white">{schoolName}</p>
          <p className="text-xs text-blue-200/80">Panel de Talleres</p>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Administración">
        {items.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive(href) ? "bg-white/10 text-white shadow-[inset_3px_0_0_#93b8fd]" : "text-blue-100/75 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link href="/admin/account" className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-white/5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/30 text-xs font-bold text-white">
            {admin.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-white">{admin.name}</p>
            <p className="flex items-center gap-1 truncate text-[11px] text-blue-200/80">
              {admin.totpEnabled && <ShieldCheck className="h-3 w-3" />}
              {ROLE_LABEL[admin.role] ?? admin.role}
            </p>
          </div>
        </Link>
        <button onClick={logout} className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-blue-100/75 hover:bg-white/5 hover:text-white">
          <LogOut className="h-[18px] w-[18px]" /> Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </button>
        <p className="text-sm font-bold tracking-wide text-navy-900">{schoolName}</p>
        <span className="w-9" />
      </div>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 bg-navy-950 lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-in bg-navy-950">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-1.5 text-blue-100 hover:bg-white/10" aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </button>
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
