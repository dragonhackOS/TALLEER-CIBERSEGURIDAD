import ExcelJS from "exceljs";
import type { z } from "zod";
import { db } from "@/lib/db";
import { formatDateTime, REGISTRATION_STATUS_LABEL } from "@/lib/format";
import type { exportQuery } from "@/schemas";
import { registrationWhere } from "./registration-query.service";

type Q = z.infer<typeof exportQuery>;

const HEADERS = ["Nombre", "Correo", "Salón", "Semestre", "Taller", "Estado", "Código", "Fecha", "Hora", "Asistencia"];

/** Previene CSV/Formula injection en Excel/Sheets. */
export function sanitizeCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

async function collectRows(q: Q, scopeIds?: string[]): Promise<string[][]> {
  if (q.scope === "waitlist") {
    const entries = await db().waitlistEntry.findMany({
      where: { status: "WAITING", ...(q.workshopId ? { workshopId: q.workshopId } : {}), ...(scopeIds ? { workshopId: { in: scopeIds } } : {}) },
      orderBy: [{ workshopId: "asc" }, { position: "asc" }],
      include: { student: true, workshop: { select: { name: true } } },
      take: 50_000,
    });
    return entries.map((e) => {
      const { date, time } = formatDateTime(e.createdAt);
      return [e.student.fullName ?? "", e.student.email, e.student.classroom ?? "", String(e.student.semester ?? ""), e.workshop.name, "En lista de espera", `#${e.position}`, date, time, "No"];
    });
  }
  const where = registrationWhere(
    {
      workshopId: q.scope === "workshop" || q.workshopId ? q.workshopId : undefined,
      date: q.scope === "date" ? q.date : undefined,
      status: q.scope === "status" ? q.status : q.scope === "attended" ? "CHECKED_IN" : undefined,
    },
    scopeIds,
  );
  const rows = await db().registration.findMany({
    where,
    orderBy: [{ workshopId: "asc" }, { createdAt: "asc" }],
    include: { student: true, workshop: { select: { name: true } }, attendance: true },
    take: 50_000,
  });
  return rows.map((r) => {
    const { date, time } = formatDateTime(r.createdAt);
    return [
      r.student.fullName ?? "",
      r.student.email,
      r.student.classroom ?? "",
      String(r.student.semester ?? ""),
      r.workshop.name,
      REGISTRATION_STATUS_LABEL[r.status] ?? r.status,
      r.registrationCode,
      date,
      time,
      r.attendance ? `Sí (${formatDateTime(r.attendance.checkedInAt).time})` : "No",
    ];
  });
}

export async function buildExport(q: Q, scopeIds?: string[]): Promise<{ body: Buffer; contentType: string; filename: string; count: number }> {
  const rows = await collectRows(q, scopeIds);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const base = `inscripciones-${q.scope}-${stamp}`;
  if (q.format === "csv") {
    const esc = (s: string) => `"${sanitizeCell(s).replace(/"/g, '""')}"`;
    const csv = [HEADERS, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    return { body: Buffer.from("﻿" + csv, "utf8"), contentType: "text/csv; charset=utf-8", filename: `${base}.csv`, count: rows.length };
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "Prepa Yucatán — Talleres";
  const ws = wb.addWorksheet("Inscripciones", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(HEADERS);
  for (const r of rows) ws.addRow(r.map(sanitizeCell));
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2A5B" } };
  ws.columns.forEach((c, i) => (c.width = [30, 34, 10, 10, 28, 16, 18, 12, 8, 14][i] ?? 14));
  ws.autoFilter = { from: "A1", to: `J${rows.length + 1}` };
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    body: buf,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `${base}.xlsx`,
    count: rows.length,
  };
}
