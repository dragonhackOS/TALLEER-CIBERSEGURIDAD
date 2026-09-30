import type { NextRequest } from "next/server";
import QRCode from "qrcode";
import { Errors } from "@/lib/errors";
import { db } from "@/lib/db";
import { signQrToken } from "@/lib/crypto";
import { route, type RouteContext } from "@/server/http/handler";
import { publicRateLimit } from "@/server/http/guards";

export const runtime = "nodejs";

/**
 * GET /api/registration/:publicId/qr[?download=1] — PNG del QR.
 * El QR contiene únicamente un token firmado (PYT1.reg_….v.firma): sin datos personales.
 */
export const GET = route(async (req: NextRequest, ctx: RouteContext<{ publicId: string }>) => {
  await publicRateLimit(req);
  const { publicId } = await ctx.params;
  if (!/^reg_[0-9a-z]{26}$/.test(publicId)) throw Errors.notFound();
  const reg = await db().registration.findUnique({ where: { publicId }, select: { publicId: true, qrVersion: true, status: true, registrationCode: true } });
  if (!reg || reg.status === "CANCELLED") throw Errors.notFound("Inscripción no disponible.");
  const png = await QRCode.toBuffer(signQrToken(reg.publicId, reg.qrVersion), {
    type: "png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#0b2a5b", light: "#ffffff" },
  });
  const download = req.nextUrl.searchParams.get("download") === "1";
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
      ...(download ? { "Content-Disposition": `attachment; filename="qr-${reg.registrationCode}.png"` } : {}),
    },
  });
});
