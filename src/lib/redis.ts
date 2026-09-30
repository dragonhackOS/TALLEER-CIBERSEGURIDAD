import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

const g = globalThis as unknown as { __redis?: Redis; __redisSub?: Redis };

function make(name: string) {
  const client = new Redis(env().REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: true,
    connectTimeout: 5000,
    lazyConnect: false,
    // family 0 = IPv4 e IPv6 (necesario en redes privadas IPv6, p. ej. Railway).
    family: 0,
  });
  client.on("error", (err) => logger.warn("redis_error", { client: name, message: err.message }));
  return client;
}

export function redis(): Redis {
  if (!g.__redis) g.__redis = make("main");
  return g.__redis;
}

/** Conexión dedicada para suscripciones pub/sub (tiempo real). */
export function redisSubscriber(): Redis {
  if (!g.__redisSub) g.__redisSub = make("subscriber");
  return g.__redisSub;
}

export async function closeRedis() {
  await Promise.allSettled([g.__redis?.quit(), g.__redisSub?.quit()]);
  g.__redis = undefined;
  g.__redisSub = undefined;
}
