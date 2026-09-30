import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset", {
  variants: {
    tone: {
      green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
      amber: "bg-amber-50 text-amber-800 ring-amber-600/25",
      red: "bg-red-50 text-red-700 ring-red-600/20",
      gray: "bg-slate-100 text-slate-600 ring-slate-500/20",
      blue: "bg-brand-50 text-brand-800 ring-brand-600/20",
      violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
    },
  },
  defaultVariants: { tone: "gray" },
});

export function Badge({ className, tone, dot, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { dot?: boolean }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
