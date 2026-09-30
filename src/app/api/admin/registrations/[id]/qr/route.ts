import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { signQrToken } from "@/lib/crypto";
import { Errors } from "@/lib/errors";
import { route, type RouteContext } from "@/server/http/handler";
import { uuid } from "@/schemas";
import { requireAdmin } from "@/server/auth/admin-session";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  await requireAdmin(req, "registrations:read");
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw Errors.notFound();
  const reg = await db().registration.findUnique({ where: { id }, select: { publicId: true, qrVersion: true } });
  if (!reg) throw Errors.notFound();
  const png = await QRCode.toBuffer(signQrToken(reg.publicId, reg.qrVersion), { type: "png", width: 360, margin: 2, color: { dark: "#0b2a5b", light: "#ffffff" } });
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
});
