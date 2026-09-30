import { SiteFooter, SiteHeader } from "@/components/public/site-header";
import { getBranding } from "@/server/services/admin.service";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader schoolName={branding.schoolName} logoUrl={branding.logoUrl} />
      <main className="flex-1">{children}</main>
      <SiteFooter schoolName={branding.schoolName} />
    </div>
  );
}
