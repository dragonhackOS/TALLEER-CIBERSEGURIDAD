import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AdminProvider } from "@/components/admin/admin-context";
import { Sidebar } from "@/components/admin/sidebar";
import { getAdminFromToken } from "@/server/auth/admin-session";
import { permissionsFor } from "@/server/auth/rbac";
import { cookieName } from "@/server/http/cookies";
import { getBranding } from "@/server/services/admin.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panel administrativo" };

/** La sesión se valida en el servidor en cada carga del panel. */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  await headers();
  const token = (await cookies()).get(cookieName("adm"))?.value;
  const admin = await getAdminFromToken(token);
  if (!admin) redirect("/admin/login");
  const branding = await getBranding();
  return (
    <AdminProvider
      admin={{ id: admin.adminId, name: admin.name, email: admin.email, role: admin.role, permissions: permissionsFor(admin.role), totpEnabled: admin.totpEnabled }}
    >
      <div className="min-h-screen bg-slate-50">
        <Sidebar schoolName={branding.schoolName} logoUrl={branding.logoUrl} />
        <main className="lg:pl-64">
          <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </AdminProvider>
  );
}
