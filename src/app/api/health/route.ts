import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — verificación para Docker/balanceadores. */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = { db: "error", redis: "error" };
  try {
    await db().$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    /* noop */
  }
  try {
    checks.redis = (await redis().ping()) === "PONG" ? "ok" : "error";
  } catch {
    /* noop */
  }
  const healthy = Object.values(checks).every((v) => v === "ok");
  return Response.json({ status: healthy ? "ok" : "degraded", checks }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
