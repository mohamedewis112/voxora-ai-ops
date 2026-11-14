"use client";

import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/status";

const toneClasses: Record<Tone, string> = {
  success: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  info: "border-teal-500/25 bg-teal-500/10 text-teal-600 dark:text-teal-400",
  neutral: "border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  violet: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  sky: "border-cyan-500/25 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
};

export function StatusBadge({
  tone = "neutral",
  label,
  dot = true,
  live = false,
  className,
}: {
  tone?: Tone;
  label: string;
  dot?: boolean;
  /** Adds a pulsing halo — for live states (dialing, speaking…). */
  live?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className
      )}
    >
      {dot ? (
        <span
          className={cn("size-1.5 shrink-0 rounded-full bg-current", live && "sc-live-dot")}
          aria-hidden="true"
        />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
