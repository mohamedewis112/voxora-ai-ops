"use client";

import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { Tone } from "@/lib/status";

const toneIcon: Record<Tone, string> = {
  success: "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-500 dark:text-amber-400",
  danger: "bg-rose-500/10 text-rose-500 dark:text-rose-400",
  info: "bg-teal-500/10 text-teal-500 dark:text-teal-400",
  neutral: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
  violet: "bg-violet-500/10 text-violet-500 dark:text-violet-400",
  sky: "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "info",
  delta,
  deltaGood,
  className,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  /** Percentage change vs previous period, e.g. +12 */
  delta?: number;
  deltaGood?: boolean;
  className?: string;
}) {
  const up = (delta ?? 0) >= 0;
  const good = deltaGood ?? up;
  return (
    <Card className={cn("p-4 md:p-5 flex flex-col gap-3 transition-colors hover:border-primary/30", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-muted-foreground leading-snug">{label}</span>
        <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-lg", toneIcon[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl md:text-[28px] font-semibold tnum leading-none">{value}</span>
        {typeof delta === "number" && Number.isFinite(delta) ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tnum",
              good ? "bg-emerald-500/10 text-emerald-500 dark:text-emerald-400" : "bg-rose-500/10 text-rose-500 dark:text-rose-400"
            )}
          >
            {up ? <ArrowUpRight className="size-3" aria-hidden="true" /> : <ArrowDownRight className="size-3" aria-hidden="true" />}
            {Math.abs(delta)}%
          </span>
        ) : null}
      </div>
    </Card>
  );
}
