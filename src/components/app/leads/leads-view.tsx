"use client";

/**
 * Leads — the sales pipeline. Kanban board (drag & drop between stages,
 * plus a hover "move to stage" menu) or a classic table view. This file
 * follows the list-view style established in recordings-view / queue-view.
 */

import { useMemo, useState } from "react";
import {
  Flame,
  FolderKanban,
  GripVertical,
  Kanban,
  Search,
  Table as TableIcon,
  Trophy,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { leadStageMeta, type Tone } from "@/lib/status";
import type { Lead, LeadStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatCard } from "@/components/app/shared/stat-card";
import { ScoreBadge } from "@/components/app/shared/score-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Fixed pipeline order — columns always render in this sequence. */
const LEAD_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "interested",
  "followup",
  "ready_to_close",
  "transferred",
  "won",
  "lost",
];

/** Solid dot color per status tone (kanban column headers). */
const TONE_DOT: Record<Tone, string> = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-teal-500",
  neutral: "bg-zinc-400",
  violet: "bg-violet-500",
  sky: "bg-cyan-500",
};

export function LeadsView() {
  const { t, fmtDate } = useI18n();
  const leads = useDataStore((s) => s.leads);
  const campaigns = useDataStore((s) => s.campaigns);
  const store = useDataStore;

  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [search, setSearch] = useState("");
  const [dragOver, setDragOver] = useState<LeadStage | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter(
      (l) => !q || `${l.name} ${l.phone} ${l.business}`.toLowerCase().includes(q)
    );
  }, [leads, search]);

  const byStage = useMemo(() => {
    const map = new Map<LeadStage, Lead[]>(LEAD_STAGES.map((st) => [st, []]));
    for (const lead of filtered) map.get(lead.stage)?.push(lead);
    return map;
  }, [filtered]);

  const countStage = (stage: LeadStage) => leads.reduce((a, l) => (l.stage === stage ? a + 1 : a), 0);

  const moveLead = (id: string, stage: LeadStage) => {
    const lead = store.getState().leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    store.getState().updateLead(id, { stage });
    toast.success(t("common.updated"));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("leads.title")}
        desc={t("leads.desc")}
        actions={
          <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={view === "kanban"}
              className={cn("h-7 gap-1.5 px-2.5 text-xs", view === "kanban" ? "bg-card shadow-sm" : "text-muted-foreground")}
              onClick={() => setView("kanban")}
            >
              <Kanban className="size-3.5" />
              {t("leads.kanban")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={view === "table"}
              className={cn("h-7 gap-1.5 px-2.5 text-xs", view === "table" ? "bg-card shadow-sm" : "text-muted-foreground")}
              onClick={() => setView("table")}
            >
              <TableIcon className="size-3.5" />
              {t("leads.table")}
            </Button>
          </div>
        }
      />

      {/* Pipeline stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("leads.title")} value={leads.length} icon={FolderKanban} tone="info" />
        <StatCard label={t("stage.interested")} value={countStage("interested")} icon={UserCheck} tone="success" />
        <StatCard label={t("stage.ready_to_close")} value={countStage("ready_to_close")} icon={Flame} tone="warning" />
        <StatCard label={t("stage.won")} value={countStage("won")} icon={Trophy} tone="violet" />
      </div>

      {/* Filters */}
      <Card className="border-border/70">
        <div className="relative p-3">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.searchPlaceholder")}
            className="h-9 ps-9"
            aria-label={t("common.search")}
          />
        </div>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title={t("leads.noLeads")} desc={t("leads.scoreHint")} />
      ) : view === "kanban" ? (
        /* ---------------------------------- Kanban ---------------------------------- */
        <div className="flex gap-3 overflow-x-auto sc-scroll pb-2">
          {LEAD_STAGES.map((stage) => (
            <StageColumn
              key={stage}
              stage={stage}
              items={byStage.get(stage) ?? []}
              highlighted={dragOver === stage}
              onCardDragStart={(id, e) => {
                e.dataTransfer.setData("text/plain", id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onCardDragEnd={() => setDragOver(null)}
              onColumnDragOver={(st, e) => {
                e.preventDefault();
                if (dragOver !== st) setDragOver(st);
              }}
              onDropCard={(st, e) => {
                e.preventDefault();
                setDragOver(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) moveLead(id, st);
              }}
              onMove={moveLead}
            />
          ))}
        </div>
      ) : (
        /* ----------------------------------- Table ---------------------------------- */
        <>
          <Card className="hidden overflow-hidden border-border/70 md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("common.phone")}</TableHead>
                  <TableHead className="w-40">{t("common.status")}</TableHead>
                  <TableHead>{t("common.score")}</TableHead>
                  <TableHead>{t("leads.lastCall")}</TableHead>
                  <TableHead>{t("leads.nextAction")}</TableHead>
                  <TableHead>{t("common.campaign")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <p className="text-[13px] font-medium">{lead.name}</p>
                      {lead.business ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{lead.business}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="tnum text-[13px]" dir="ltr">
                      {lead.phone}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={lead.stage}
                        onValueChange={(v) => moveLead(lead.id, v as LeadStage)}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs" aria-label={t("leads.moveTo")}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STAGES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {t(leadStageMeta[st].key)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <ScoreBadge score={lead.score} />
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground tnum">
                      {lead.lastCallAt ? fmtDate(lead.lastCallAt) : "—"}
                    </TableCell>
                    <TableCell className="max-w-48">
                      <p className="line-clamp-2 text-xs text-muted-foreground">{lead.nextAction || "—"}</p>
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {campaigns.find((c) => c.id === lead.campaignId)?.name ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards (table view) */}
          <div className="space-y-2.5 md:hidden">
            {filtered.map((lead) => (
              <LeadCard key={lead.id} lead={lead} onMove={(st) => moveLead(lead.id, st)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------- Kanban pieces -------------------------------- */

function StageColumn({
  stage,
  items,
  highlighted,
  onCardDragStart,
  onCardDragEnd,
  onColumnDragOver,
  onDropCard,
  onMove,
}: {
  stage: LeadStage;
  items: Lead[];
  highlighted: boolean;
  onCardDragStart: (leadId: string, e: React.DragEvent<HTMLDivElement>) => void;
  onCardDragEnd: () => void;
  onColumnDragOver: (stage: LeadStage, e: React.DragEvent<HTMLDivElement>) => void;
  onDropCard: (stage: LeadStage, e: React.DragEvent<HTMLDivElement>) => void;
  onMove: (leadId: string, stage: LeadStage) => void;
}) {
  const { t } = useI18n();
  const meta = leadStageMeta[stage];
  return (
    <div
      onDragOver={(e) => onColumnDragOver(stage, e)}
      onDrop={(e) => onDropCard(stage, e)}
      className={cn(
        "flex min-w-[240px] flex-1 shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2 transition-colors",
        highlighted && "border-primary bg-primary/5"
      )}
    >
      <div className="flex items-center gap-2 px-1 py-1">
        <span className={cn("size-2 shrink-0 rounded-full", TONE_DOT[meta.tone])} aria-hidden="true" />
        <span className="text-xs font-semibold">{t(meta.key)}</span>
        <span className="ms-auto rounded-full bg-muted px-2 py-0.5 text-[11px] tnum text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            draggable
            onDragStart={(e) => onCardDragStart(lead.id, e)}
            onDragEnd={onCardDragEnd}
            onMove={(st) => onMove(lead.id, st)}
          />
        ))}
        {items.length === 0 ? <div className="rounded-lg border border-dashed py-6" aria-hidden="true" /> : null}
      </div>
    </div>
  );
}

function LeadCard({
  lead,
  draggable = false,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  lead: Lead;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLDivElement>) => void;
  onMove: (stage: LeadStage) => void;
}) {
  const { t, fmtDate } = useI18n();
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group/card space-y-1.5 rounded-xl border bg-card p-3 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{lead.name}</p>
          {lead.business ? (
            <p className="truncate text-xs text-muted-foreground">{lead.business}</p>
          ) : null}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground opacity-50 transition-opacity group-hover/card:opacity-100"
              aria-label={t("leads.moveTo")}
            >
              <GripVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {t("leads.moveTo")}
            </DropdownMenuLabel>
            {LEAD_STAGES.map((st) => (
              <DropdownMenuItem
                key={st}
                disabled={st === lead.stage}
                onClick={() => onMove(st)}
              >
                <span className={cn("size-2 rounded-full", TONE_DOT[leadStageMeta[st].tone])} aria-hidden="true" />
                {t(leadStageMeta[st].key)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p dir="ltr" className="text-xs text-muted-foreground tnum">
        {lead.phone}
      </p>
      <div className="flex items-center justify-between gap-2">
        <ScoreBadge score={lead.score} />
        <span className="truncate text-[11px] text-muted-foreground tnum">
          {t("leads.lastCall")}: {lead.lastCallAt ? fmtDate(lead.lastCallAt) : "—"}
        </span>
      </div>
      {lead.nextAction ? (
        <p className="line-clamp-2 text-[11px] text-muted-foreground">{lead.nextAction}</p>
      ) : null}
    </div>
  );
}
