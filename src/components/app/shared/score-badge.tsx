"use client";

import { cn } from "@/lib/utils";

/** Lead-score pill — hot (emerald) / warm (amber) / cold (zinc). */
export function ScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone =
    score >= 80 ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
    : score >= 50 ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
    : "text-muted-foreground bg-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tnum",
        tone,
        className
      )}
    >
      {score}
    </span>
  );
}
