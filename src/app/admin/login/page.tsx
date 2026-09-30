import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminFromToken } from "@/server/auth/admin-session";
import { cookieName } from "@/server/http/cookies";
import { getBranding } from "@/server/services/admin.service";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acceso administrativo" };

export default async function AdminLoginPage() {
  const admin = await getAdminFromToken((await cookies()).get(cookieName("adm"))?.value);
  if (admin) redirect("/admin");
  const b = await getBranding();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy-950 lg:block">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50rem_30rem_at_0%_0%,rgba(59,108,246,.35),transparent_60%),radial-gradient(40rem_30rem_at_100%_100%,rgba(29,63,216,.35),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.logoUrl} alt="" className="h-10 w-10 rounded-lg bg-white/10 object-contain p-0.5" />
            <div className="leading-tight"><p className="text-sm font-bold tracking-[0.12em]">{b.schoolName}</p><p className="text-sm text-blue-200">Talleres</p></div>
          </div>
          <div>
            <h1 className="max-w-md text-4xl font-extrabold leading-tight tracking-tight">Administra inscripciones, cupos y asistencia en tiempo real.</h1>
            <p className="mt-4 max-w-md text-blue-100/80">Acceso exclusivo para personal autorizado. Toda acción queda registrada en la bitácora de auditoría.</p>
          </div>
          <p className="text-xs text-blue-200/60">Sesiones cifradas · Argon2id · 2FA opcional</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <LoginForm />
      </div>
    </div>
  );
}
