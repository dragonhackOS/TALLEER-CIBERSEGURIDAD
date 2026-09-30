import { Code2, Cpu, Flag, GraduationCap, Network, ShieldCheck, Terminal, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { terminal: Terminal, cpu: Cpu, flag: Flag, shield: ShieldCheck, code: Code2, network: Network, bot: Bot, default: GraduationCap };

export function WorkshopIcon({ icon, imageUrl, className }: { icon?: string | null; imageUrl?: string | null; className?: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className={cn("h-12 w-12 rounded-xl object-cover", className)} />;
  }
  const Icon = ICONS[(icon ?? "default") as keyof typeof ICONS] ?? ICONS.default;
  return (
    <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-700 ring-1 ring-inset ring-brand-200/60", className)}>
      <Icon className="h-6 w-6" strokeWidth={1.75} />
    </div>
  );
}

export const ICON_OPTIONS = Object.keys(ICONS).filter((k) => k !== "default");
