import type { NextRequest } from "next/server";
import { json, route } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";
import { listPublicWorkshops } from "@/server/services/workshop.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workshops — catálogo público con cupos calculados en el servidor. */
export const GET = route(async (req: NextRequest) => {
  await publicRateLimit(req);
  return json({ workshops: await listPublicWorkshops(), serverTime: new Date().toISOString() });
});
