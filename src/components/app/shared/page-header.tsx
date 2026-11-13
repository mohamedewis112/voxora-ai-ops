"use client";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  desc,
  actions,
  className,
}: {
  title: string;
  desc?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 mb-5 md:mb-6", className)}>
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-semibold tracking-tight leading-tight">{title}</h1>
        {desc ? <p className="text-sm text-muted-foreground mt-1.5 max-w-2xl">{desc}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
