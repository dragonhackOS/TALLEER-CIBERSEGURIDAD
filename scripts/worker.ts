/**
 * Worker de mantenimiento (servicio "worker" en docker-compose):
 *  - cada 5 s: expira reservas, promueve lista de espera, envía correos pendientes
 *  - cada hora: limpieza de OTP / sesiones / idempotencia vencidas
 */
import "dotenv/config";
import { logger } from "../src/lib/logger";
import { runCleanup, runMaintenanceTick } from "../src/server/services/maintenance.service";

const TICK_MS = Number(process.env.WORKER_TICK_MS ?? 5000);
let stopping = false;
let lastCleanup = 0;

async function loop() {
  logger.info("worker_started", { tickMs: TICK_MS });
  while (!stopping) {
    try {
      await runMaintenanceTick();
      if (Date.now() - lastCleanup > 3600_000) {
        await runCleanup();
        lastCleanup = Date.now();
      }
    } catch (err) {
      logger.error("worker_tick_error", { message: (err as Error).message });
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  logger.info("worker_stopped");
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => (stopping = true));
void loop();
