import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { env } from "./env";
import { logger } from "./logger";

/** Elimina parámetros específicos de Prisma que el driver `pg` no entiende. */
function pgConnectionString(url: string): string {
  try {
    const u = new URL(url);
    for (const p of ["schema", "connection_limit", "pool_timeout", "pgbouncer"]) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return url;
  }
}

function createClient() {
  const e = env();
  const adapter = new PrismaPg({
    connectionString: pgConnectionString(e.DATABASE_URL),
    max: e.DB_POOL_MAX,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
  });
  return new PrismaClient({ adapter, log: e.NODE_ENV === "development" ? ["warn", "error"] : ["warn"] });
}

const globalForPrisma = globalThis as unknown as { __prisma?: ReturnType<typeof createClient> };

export function db() {
  if (!globalForPrisma.__prisma) globalForPrisma.__prisma = createClient();
  return globalForPrisma.__prisma;
}

export type Db = ReturnType<typeof db>;
export type Tx = Prisma.TransactionClient;
export { Prisma };

const RETRYABLE_PG = new Set(["40001", "40P01"]); // serialization_failure, deadlock_detected

function isRetryable(err: unknown): boolean {
  const e = err as { code?: string; meta?: { code?: string }; message?: string; cause?: { code?: string } };
  if (e?.code === "P2034") return true;
  const pg = e?.meta?.code ?? e?.cause?.code ?? e?.code;
  if (pg && RETRYABLE_PG.has(pg)) return true;
  return typeof e?.message === "string" && /deadlock detected|could not serialize access/i.test(e.message);
}

/**
 * Ejecuta una transacción interactiva con reintentos ante deadlocks o
 * fallos de serialización. Toda la lógica de cupos corre aquí.
 */
export async function withTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  opts: { isolationLevel?: Prisma.TransactionIsolationLevel; retries?: number; label?: string } = {},
): Promise<T> {
  const retries = opts.retries ?? 5;
  let attempt = 0;
  for (;;) {
    try {
      return await db().$transaction(fn, {
        isolationLevel: opts.isolationLevel ?? Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 20_000,
        timeout: 20_000,
      });
    } catch (err) {
      if (attempt < retries && isRetryable(err)) {
        attempt++;
        logger.warn("tx_retry", { label: opts.label, attempt });
        await new Promise((r) => setTimeout(r, 10 * attempt + Math.random() * 40));
        continue;
      }
      throw err;
    }
  }
}

/** ¿El error es una violación de unicidad (opcionalmente de un índice concreto)? */
export function isUniqueViolation(err: unknown, indexName?: string): boolean {
  const e = err as { code?: string; meta?: Record<string, unknown>; message?: string };
  const text = `${e?.message ?? ""} ${JSON.stringify(e?.meta ?? {})}`;
  const unique = e?.code === "P2002" || /23505|unique constraint/i.test(text);
  if (!unique) return false;
  return indexName ? text.includes(indexName) : true;
}

export function isCheckViolation(err: unknown, name?: string): boolean {
  const e = err as { code?: string; meta?: Record<string, unknown>; message?: string };
  const text = `${e?.message ?? ""} ${JSON.stringify(e?.meta ?? {})}`;
  const check = /23514|check constraint/i.test(text);
  return check && (!name || text.includes(name));
}
