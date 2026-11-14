"use client";

/**
 * Voxora AI — Bot queue view (طابور AI Bot).
 *
 * The API lazily advances simulated bot runs on every GET, so the view polls
 * every 5s. Original sales ownership is preserved: every row shows the original
 * sales owner, and completed leads can be returned to them explicitly.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  ChevronLeft,
  ChevronsUp,
  MoreHorizontal,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { opsPost, useOps } from "@/hooks/use-ops";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { useUiStore } from "@/stores/ui-store";
import type { BotQueueDTO } from "@/lib/ops-types";
import type { Tone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/* ------------------------------- constants ------------------------------- */

type BotAction = "start" | "pause" | "resume" | "remove" | "prioritize" | "return_to_sales";

const BOT_STATUS_META: Record<string, { key: string; tone: Tone; live?: boolean }> = {
  queued: { key: "bot.status.queued", tone: "warning" },
  running: { key: "bot.status.running", tone: "violet", live: true },
  paused: { key: "bot.status.paused", tone: "neutral" },
  done: { key: "bot.status.done", tone: "success" },
  returned: { key: "bot.status.returned", tone: "success" },
};

const STAT_CHIPS = ["queued", "running", "done"] as const;
type StatChip = (typeof STAT_CHIPS)[number];

const STAT_DOT: Record<StatChip, string> = {
  queued: "bg-amber-500",
  running: "bg-violet-500",
  done: "bg-emerald-500",
};

/** Inline literals — pending i18n keys (bot.ownershipNote / bot.returnedToast). */
const OWNERSHIP_NOTE = "الملكية محفوظة";
const RETURNED_TOAST = "أُعيد العميل للموظف الأصلي";

function priorityBadgeClasses(priority: number): string {
  if (priority <= 1) return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400";
  if (priority === 2) return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400";
}

function leadDisplayName(item: BotQueueDTO): string {
  const lead = item.lead;
  if (!lead) return "—";
  return lead.businessName || lead.customerName || lead.normalizedPhone || "—";
}

interface RowAction {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
}

/* --------------------------------- view --------------------------------- */

export function BotQueueView() {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useOps<BotQueueDTO[]>("bot-queue", undefined, { pollMs: 5000 });
  const selectLead = useOpsUiStore((s) => s.selectLead);
  const setView = useUiStore((s) => s.setView);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<BotQueueDTO | null>(null);

  const rows = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<StatChip, number> = { queued: 0, running: 0, done: 0 };
    for (const r of rows) {
      if (r.status === "queued" || r.status === "running" || r.status === "done") c[r.status] += 1;
    }
    return c;
  }, [rows]);

  const openLead = (item: BotQueueDTO) => {
    if (!item.lead) return;
    selectLead(item.lead.id);
    setView("sales");
  };

  const runAction = async (item: BotQueueDTO, action: BotAction, message?: string) => {
    setBusyId(item.id);
    try {
      await opsPost(`bot-queue/${item.id}/action`, { action });
      if (message) toast.success(message);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const confirmRemove = () => {
    const target = removeTarget;
    setRemoveTarget(null);
    if (target) void runAction(target, "remove", t("bot.remove"));
  };

  const actionsFor = (item: BotQueueDTO): RowAction[] => {
    switch (item.status) {
      case "queued":
        return [
          { label: t("bot.start"), icon: Play, onSelect: () => void runAction(item, "start", t("bot.start")) },
          { label: t("bot.prioritize"), icon: ChevronsUp, onSelect: () => void runAction(item, "prioritize", t("bot.prioritize")) },
          { label: t("bot.remove"), icon: Trash2, onSelect: () => setRemoveTarget(item), danger: true },
        ];
      case "running":
        return [{ label: t("bot.pause"), icon: Pause, onSelect: () => void runAction(item, "pause", t("bot.pause")) }];
      case "paused":
        return [
          { label: t("bot.resume"), icon: Play, onSelect: () => void runAction(item, "resume", t("bot.resume")) },
          { label: t("bot.remove"), icon: Trash2, onSelect: () => setRemoveTarget(item), danger: true },
        ];
      case "done":
        return [
          { label: t("bot.returnToSales"), icon: Undo2, onSelect: () => void runAction(item, "return_to_sales", RETURNED_TOAST) },
        ];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("bot.title")}
        desc={t("bot.desc")}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            {t("ops.demoMode")}
          </span>
        }
      />

      {/* Stats chips — counts per status */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("ops.status")}>
        {STAT_CHIPS.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
          >
            <span className={cn("size-1.5 rounded-full", STAT_DOT[s])} aria-hidden="true" />
            {t(`bot.status.${s}`)}
            <span className="tnum font-semibold text-foreground">{counts[s]}</span>
          </span>
        ))}
      </div>

      {error && !data ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={AlertTriangle}
              title={t("ops.errorLoad")}
              desc={error}
              action={
                <Button variant="outline" size="sm" onClick={refresh}>
                  <RefreshCw className="size-4" />
                  {t("ops.retry")}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : loading && !data ? (
        <Card aria-busy="true">
          <CardContent className="space-y-3">
            <span className="sr-only">{t("ops.loading")}</span>
            <Skeleton className="h-8 w-full" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-8 w-8" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/70 py-0">
          {error && rows.length > 0 ? (
            <p className="border-b border-border/70 px-4 py-2 text-xs text-muted-foreground">{t("ops.errorLoad")}</p>
          ) : null}

          {rows.length === 0 ? (
            <div className="p-6">
              <EmptyState icon={Bot} title={t("bot.empty")} />
            </div>
          ) : (
            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-start">{t("bot.customer")}</TableHead>
                  <TableHead className="text-start">{t("ops.phone")}</TableHead>
                  <TableHead className="text-start">{t("bot.salesOwner")}</TableHead>
                  <TableHead className="text-start">{t("ops.priority")}</TableHead>
                  <TableHead className="text-start">{t("bot.attempts")}</TableHead>
                  <TableHead className="text-start">{t("ops.status")}</TableHead>
                  <TableHead className="text-start">{t("bot.lastResult")}</TableHead>
                  <TableHead className="text-end">{t("ops.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => {
                  const meta = BOT_STATUS_META[item.status] ?? { key: item.status, tone: "neutral" as Tone };
                  const actions = actionsFor(item);
                  return (
                    <TableRow
                      key={item.id}
                      className={cn(item.lead && "cursor-pointer")}
                      onClick={() => openLead(item)}
                    >
                      {/* Customer — click opens the lead detail in the sales view */}
                      <TableCell>
                        <button
                          type="button"
                          title={t("ops.openLead")}
                          className="inline-flex max-w-[230px] items-center gap-1 text-start text-[13px] font-medium underline-offset-4 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openLead(item);
                          }}
                        >
                          <span className="truncate">{leadDisplayName(item)}</span>
                          <ChevronLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        </button>
                      </TableCell>

                      {/* Phone */}
                      <TableCell className="tnum text-[13px] text-muted-foreground">
                        <span dir="ltr">{item.lead?.normalizedPhone ?? "—"}</span>
                      </TableCell>

                      {/* Original sales owner — ownership preserved */}
                      <TableCell>
                        {item.lead?.agentName ? (
                          <span className="block">
                            <span className="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
                              {item.lead.agentName}
                            </span>
                            <span className="block text-[10px] text-muted-foreground">{OWNERSHIP_NOTE}</span>
                          </span>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Priority — 1 = highest */}
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded-full border text-xs font-semibold tnum",
                            priorityBadgeClasses(item.priority)
                          )}
                          aria-label={`${t("ops.priority")}: ${item.priority}`}
                        >
                          {item.priority}
                        </span>
                      </TableCell>

                      {/* Attempts */}
                      <TableCell className="tnum text-[13px]">{item.attempts}</TableCell>

                      {/* Status */}
                      <TableCell>
                        <StatusBadge tone={meta.tone} label={t(meta.key)} live={meta.live} />
                      </TableCell>

                      {/* Last result */}
                      <TableCell className="max-w-[220px] truncate text-[13px] text-muted-foreground">
                        {item.lastResult ?? "—"}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-end" onClick={(e) => e.stopPropagation()}>
                        {actions.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                disabled={busyId === item.id}
                                aria-label={t("ops.actions")}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {actions.map((a) => (
                                <DropdownMenuItem
                                  key={a.label}
                                  onClick={a.onSelect}
                                  className={a.danger ? "text-destructive focus:text-destructive" : undefined}
                                >
                                  <a.icon className="size-4" />
                                  {a.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      {/* Remove confirmation */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(o) => {
          if (!o) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("bot.remove")}</AlertDialogTitle>
            <AlertDialogDescription>{t("bot.removeConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("ops.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: "destructive" })}
              onClick={() => confirmRemove()}
            >
              {t("bot.remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
