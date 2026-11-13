"use client";

/**
 * Call queue — contacts the agent will dial automatically, with ordering,
 * priority and pause/resume controls. Do-not-call contacts are flagged.
 */

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  ChevronsUp,
  MoreHorizontal,
  Pause,
  PhoneCall,
  Play,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { getTelephony } from "@/services/telephony";
import { priorityMeta, queueStatusMeta } from "@/lib/status";
import type { QueueItem } from "@/lib/types";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { ConfirmDialog } from "@/components/app/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function QueueView() {
  const { t, fmtDateTime } = useI18n();
  const queue = useDataStore((s) => s.queue);
  const contacts = useDataStore((s) => s.contacts);
  const campaigns = useDataStore((s) => s.campaigns);
  const store = useDataStore;
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const waiting = queue.filter((q) => q.status === "waiting").length;

  const callNow = async (item: QueueItem) => {
    try {
      await getTelephony().startCall({ id: item.contactId, name: item.name, phone: item.phone, campaignId: item.campaignId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  type RowAction = { label: string; icon: LucideIcon; onClick: () => void; hidden?: boolean; danger?: boolean };

  const actions = (item: QueueItem): RowAction[] => [
    { label: t("common.callNow"), icon: PhoneCall, onClick: () => void callNow(item), hidden: item.status !== "waiting" },
    { label: t("queue.moveUp"), icon: ArrowUp, onClick: () => store.getState().moveQueueItem(item.id, -1) },
    { label: t("queue.moveDown"), icon: ArrowDown, onClick: () => store.getState().moveQueueItem(item.id, 1) },
    { label: t("queue.top"), icon: ChevronsUp, onClick: () => store.getState().sendQueueItemTop(item.id) },
    {
      label: t("queue.prioritize"),
      icon: ChevronsUp,
      onClick: () => {
        store.getState().updateQueueItem(item.id, { priority: "high" });
        store.getState().sendQueueItemTop(item.id);
        toast.success(t("queue.prioritize"));
      },
    },
    item.status === "paused"
      ? { label: t("queue.resumeAll"), icon: Play, onClick: () => store.getState().updateQueueItem(item.id, { status: "waiting" as const }) }
      : { label: t("dash.pause"), icon: Pause, onClick: () => store.getState().updateQueueItem(item.id, { status: "paused" as const }), hidden: item.status !== "waiting" },
    { label: t("queue.remove"), icon: Trash2, onClick: () => setConfirmRemove(item.id), danger: true },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("queue.title")}
        desc={t("queue.desc")}
        actions={
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground tnum">
            {waiting} {t("queueStatus.waiting")}
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { store.getState().setQueuePaused(true); toast.info(t("toast.agentPaused")); }}
          disabled={waiting === 0}
        >
          <Pause className="size-4" />
          {t("queue.pauseAll")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { store.getState().setQueuePaused(false); toast.success(t("queue.resumeAll")); }}
        >
          <Play className="size-4" />
          {t("queue.resumeAll")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { store.getState().clearFinishedQueue(); toast.success(t("queue.clearDone")); }}
        >
          <Trash2 className="size-4" />
          {t("queue.clearDone")}
        </Button>
      </div>

      {/* Desktop table */}
      <Card className="hidden overflow-hidden border-border/70 md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-12">{t("queue.order")}</TableHead>
              <TableHead>{t("calls.contactName")}</TableHead>
              <TableHead>{t("common.phone")}</TableHead>
              <TableHead>{t("common.campaign")}</TableHead>
              <TableHead>{t("queue.attempts")}</TableHead>
              <TableHead>{t("queue.priority")}</TableHead>
              <TableHead>{t("queue.scheduled")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((item, idx) => {
              const contact = contacts.find((c) => c.id === item.contactId);
              const dnd = contact?.status === "dnd";
              const campaignName = campaigns.find((c) => c.id === item.campaignId)?.name ?? "—";
              return (
                <TableRow key={item.id}>
                  <TableCell className="tnum text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <p className="text-[13px] font-medium">{item.name}</p>
                    {dnd ? (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-rose-500">
                        <Ban className="size-3" /> {t("queue.dndBlocked")}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tnum text-[13px]" dir="ltr">{item.phone}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{campaignName}</TableCell>
                  <TableCell className="tnum text-[13px]">{item.attempts}</TableCell>
                  <TableCell><StatusBadge tone={priorityMeta[item.priority].tone} label={t(priorityMeta[item.priority].key)} /></TableCell>
                  <TableCell className="text-[13px] text-muted-foreground tnum">{fmtDateTime(item.scheduledAt)}</TableCell>
                  <TableCell><StatusBadge tone={queueStatusMeta[item.status].tone} label={t(queueStatusMeta[item.status].key)} /></TableCell>
                  <TableCell className="text-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8" aria-label={t("common.actions")}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {actions(item).filter((a) => !a.hidden).map((a) => (
                          <DropdownMenuItem
                            key={a.label}
                            onClick={a.onClick}
                            className={a.danger ? "text-destructive focus:text-destructive" : undefined}
                          >
                            <a.icon className="size-4" /> {a.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {queue.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={PhoneCall} title={t("queue.empty")} desc={t("queue.emptyDesc")} />
          </div>
        ) : null}
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2.5 md:hidden">
        {queue.map((item, idx) => {
          const contact = contacts.find((c) => c.id === item.contactId);
          const dnd = contact?.status === "dnd";
          return (
            <div key={item.id} className="rounded-xl border border-border bg-card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">
                  <span className="tnum text-muted-foreground">{idx + 1}. </span>
                  {item.name}
                </p>
                <StatusBadge tone={queueStatusMeta[item.status].tone} label={t(queueStatusMeta[item.status].key)} />
              </div>
              <p dir="ltr" className="mt-1 text-xs text-muted-foreground tnum">{item.phone}</p>
              {dnd ? (
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-rose-500">
                  <Ban className="size-3" /> {t("queue.dndBlocked")}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <StatusBadge tone={priorityMeta[item.priority].tone} label={t(priorityMeta[item.priority].key)} dot={false} />
                <span className="tnum">{t("queue.attempts")}: {item.attempts}</span>
                <span className="tnum">{fmtDateTime(item.scheduledAt)}</span>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <Button variant="outline" size="sm" className="h-7 flex-1 text-xs" onClick={() => void callNow(item)} disabled={item.status !== "waiting"}>
                  <PhoneCall className="size-3" /> {t("common.callNow")}
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => store.getState().moveQueueItem(item.id, -1)} aria-label={t("queue.moveUp")}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => store.getState().moveQueueItem(item.id, 1)} aria-label={t("queue.moveDown")}>
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setConfirmRemove(item.id)} aria-label={t("queue.remove")}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {queue.length === 0 ? (
          <EmptyState icon={PhoneCall} title={t("queue.empty")} desc={t("queue.emptyDesc")} />
        ) : null}
      </div>

      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}
        title={t("queue.remove")}
        desc={t("common.confirmDeleteDesc")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (confirmRemove) store.getState().removeQueueItems([confirmRemove]);
          toast.success(t("queue.remove"));
        }}
      />
    </div>
  );
}
