import { cn } from "@/lib/utils";

export function Progress({ value, className, tone }: { value: number; className?: string; tone?: "blue" | "amber" | "red" | "green" }) {
  const v = Math.max(0, Math.min(100, value));
  const t = tone ?? (v >= 100 ? "red" : v >= 80 ? "amber" : "blue");
  const color = { blue: "bg-brand-600", amber: "bg-amber-500", red: "bg-red-500", green: "bg-emerald-500" }[t];
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", color)} style={{ width: `${v}%` }} />
    </div>
  );
}
