import type { NextRequest } from "next/server";
import { checkRateLimit, RULES } from "@/server/rate-limit";
import { clientIp } from "./handler";
import { hashIp } from "@/lib/crypto";

/** Límite general de la API pública: 60 solicitudes/minuto por IP. */
export async function publicRateLimit(req: NextRequest): Promise<{ ip: string; ipHash: string | null }> {
  const ip = clientIp(req);
  await checkRateLimit(RULES.publicApi, ip);
  return { ip, ipHash: hashIp(ip) };
}
