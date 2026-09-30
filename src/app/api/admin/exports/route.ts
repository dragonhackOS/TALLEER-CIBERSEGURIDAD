import type { NextRequest } from "next/server";
import { parseQuery, route } from "@/server/http/handler";
import { exportQuery } from "@/schemas";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { isScopedToAssignedWorkshops } from "@/server/auth/rbac";
import { buildExport } from "@/server/services/export.service";
import { audit } from "@/server/services/audit.service";

export const runtime = "nodejs";

/** GET /api/admin/exports?format=csv|xlsx&scope=… — descarga auditada. */
export const GET = route(async (req: NextRequest) => {
  const a = await requireAdmin(req, "exports:create");
  const q = parseQuery(req, exportQuery);
  const scope = isScopedToAssignedWorkshops(a.role) ? await instructorWorkshopIds(a.adminId) : undefined;
  const file = await buildExport(q, scope);
  await audit({ action: "EXPORT_CREATED", adminId: a.adminId, resourceType: "export", metadata: { ...q, rows: file.count }, ipHash: a.ipHash });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
