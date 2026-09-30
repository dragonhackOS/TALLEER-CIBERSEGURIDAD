"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** Paleta: una sola serie por gráfica → un solo tono de marca (sin leyenda). */
const BRAND = "#1d3fd8";
const GRID = "#e2e8f0";
const INK = "#64748b";

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 8px 24px -8px rgba(15,23,42,.18)", fontSize: 12 };

export function SimpleBar({ data, x, y, height = 240, horizontal, label = "Inscritos" }: { data: Record<string, unknown>[]; x: string; y: string; height?: number; horizontal?: boolean; label?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      {horizontal ? (
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey={x} width={130} tick={{ fill: "#334155", fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(29,63,216,.06)" }} contentStyle={tooltipStyle} formatter={(v) => [v as number, label]} />
          <Bar isAnimationActive={false} dataKey={y} fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={22} />
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID} />
          <XAxis dataKey={x} tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(29,63,216,.06)" }} contentStyle={tooltipStyle} formatter={(v) => [v as number, label]} />
          <Bar isAnimationActive={false} dataKey={y} fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export function SimpleLine({ data, x, y, height = 240, label = "Registros" }: { data: Record<string, unknown>[]; x: string; y: string; height?: number; label?: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ left: -16, right: 12, top: 8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={x} tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis allowDecimals={false} tick={{ fill: INK, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v as number, label]} cursor={{ stroke: "#94a3b8", strokeDasharray: "3 3" }} />
        <Line isAnimationActive={false} type="monotone" dataKey={y} stroke={BRAND} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
