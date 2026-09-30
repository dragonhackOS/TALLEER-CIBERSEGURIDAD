import type { NextRequest } from "next/server";
import { instructorWorkshopIds, requireAdmin } from "@/server/auth/admin-session";
import { can, isScopedToAssignedWorkshops } from "@/server/auth/rbac";
import { route } from "@/server/http/handler";
import { realtimeEmitter, type RealtimeEvent } from "@/server/services/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/stream — Server-Sent Events para el panel en tiempo real. */
export const GET = route(async (req: NextRequest) => {
  const admin = await requireAdmin(req, "dashboard:read");
  const scope = isScopedToAssignedWorkshops(admin.role) ? new Set(await instructorWorkshopIds(admin.adminId)) : null;
  const canSeeNames = can(admin.role, "registrations:read");
  const emitter = realtimeEmitter();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const onEvent = (e: RealtimeEvent) => {
        if (scope && !scope.has(e.workshopId)) return;
        const safe = !canSeeNames && "studentName" in e ? { ...e, studentName: "" } : e;
        send("update", safe);
      };
      emitter.on("event", onEvent);
      const heartbeat = setInterval(() => send("ping", { t: Date.now() }), 25_000);
      // Cierre forzado cada 30 min: el cliente reconecta y se revalida la sesión.
      const maxLife = setTimeout(() => cleanup(), 30 * 60_000);
      send("ready", { t: Date.now() });
      cleanup = () => {
        clearInterval(heartbeat);
        clearTimeout(maxLife);
        emitter.off("event", onEvent);
        try {
          controller.close();
        } catch {
          /* ya cerrado */
        }
      };
      req.signal.addEventListener("abort", () => cleanup());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
