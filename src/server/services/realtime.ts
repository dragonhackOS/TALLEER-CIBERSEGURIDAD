import { EventEmitter } from "node:events";
import { redis, redisSubscriber } from "@/lib/redis";
import { logger } from "@/lib/logger";

/** Eventos en tiempo real para el panel administrativo (Redis Pub/Sub → SSE). */
export const REALTIME_CHANNEL = "py:realtime";

export type RealtimeEvent =
  | {
      type: "registration.created";
      workshopId: string;
      workshopName: string;
      studentName: string;
      registrationId: string;
      registered: number;
      capacity: number;
      at: string;
      source: "WEB" | "WAITLIST" | "ADMIN";
    }
  | { type: "registration.cancelled"; workshopId: string; workshopName: string; registered: number; capacity: number; at: string }
  | { type: "checkin"; workshopId: string; registrationId: string; studentName: string; at: string }
  | { type: "workshop.updated"; workshopId: string; at: string }
  | { type: "waitlist.changed"; workshopId: string; at: string };

export async function publish(event: RealtimeEvent) {
  try {
    await redis().publish(REALTIME_CHANNEL, JSON.stringify(event));
  } catch (err) {
    logger.warn("realtime_publish_failed", { message: (err as Error).message });
  }
}

const g = globalThis as unknown as { __rtEmitter?: EventEmitter; __rtSubscribed?: boolean };

/** Suscripción compartida por proceso; cada conexión SSE escucha el emisor local. */
export function realtimeEmitter(): EventEmitter {
  if (!g.__rtEmitter) {
    g.__rtEmitter = new EventEmitter();
    g.__rtEmitter.setMaxListeners(1000);
  }
  if (!g.__rtSubscribed) {
    g.__rtSubscribed = true;
    const sub = redisSubscriber();
    sub.subscribe(REALTIME_CHANNEL).catch((err) => {
      g.__rtSubscribed = false;
      logger.error("realtime_subscribe_failed", { message: (err as Error).message });
    });
    sub.on("message", (channel, message) => {
      if (channel !== REALTIME_CHANNEL) return;
      try {
        g.__rtEmitter!.emit("event", JSON.parse(message) as RealtimeEvent);
      } catch {
        /* ignorar mensajes malformados */
      }
    });
  }
  return g.__rtEmitter;
}
