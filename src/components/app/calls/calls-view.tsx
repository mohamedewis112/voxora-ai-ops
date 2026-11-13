"use client";

/**
 * Calls history — filterable professional table (desktop) that converts to
 * stacked cards on mobile. Row click opens the full call-details sheet.
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Filter,
  PhoneCall,
  Search,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { useUiStore } from "@/stores/ui-store";
import { callStatusMeta, outcomeMeta, directionMeta } from "@/lib/status";
import type { Call } from "@/lib/types";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { CallDetailsSheet } from "./call-details-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PAGE = 12;

type DateRange = "all" | "today" | "7" | "30";

export function CallsView() {
  const { t, fmtDuration, fmtDateTime } = useI18n();
  const calls = useDataStore((s) => s.calls);
  const campaigns = useDataStore((s) => s.campaigns);
  const initialSearch = useUiStore((s) => s.callsSearch);
  const setCallsSearch = useUiStore((s) => s.setCallsSearch);

  const [search, setSearch] = useState(initialSearch);
  const [campaign, setCampaign] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [outcome, setOutcome] = useState<string>("all");
  const [range, setRange] = useState<DateRange>("all");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Call | null>(null);

  const filtered = useMemo(() => {
    const now = Date.now();
    const minTime =
      range === "today" ? new Date().setHours(0, 0, 0, 0)
      : range === "7" ? now - 7 * 86400_000
      : range === "30" ? now - 30 * 86400_000
      : 0;
    const q = search.trim().toLowerCase();
    return calls.filter((c) => {
      if (new Date(c.startedAt).getTime() < minTime) return false;
      if (campaign !== "all" && c.campaignId !== campaign) return false;
      if (status !== "all" && c.status !== status) return false;
      if (outcome !== "all" && c.outcome !== outcome) return false;
      if (q && !`${c.contactName} ${c.phone}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [calls, campaign, status, outcome, range, search]);

  const shown = filtered.slice(0, limit);
  const hasFilters = campaign !== "all" || status !== "all" || outcome !== "all" || range !== "all" || !!search;

  const resetFilters = () => {
    setCampaign("all");
    setStatus("all");
    setOutcome("all");
    setRange("all");
    setSearch("");
    setCallsSearch("");
    setLimit(PAGE);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("calls.title")}
        desc={t("calls.desc")}
        actions={
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground tnum">
            {filtered.length} {t("calls.results")}
          </span>
        }
      />

      {/* Filters */}
      <Card className="border-border/70">
        <CardContent className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-5">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }}
              placeholder={t("common.searchPlaceholder")}
              className="h-9 ps-9"
              aria-label={t("common.search")}
            />
          </div>
          <Select value={campaign} onValueChange={(v) => { setCampaign(v); setLimit(PAGE); }}>
            <SelectTrigger className="h-9" aria-label={t("calls.filterCampaign")}>
              <SelectValue placeholder={t("calls.filterCampaign")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setLimit(PAGE); }}>
            <SelectTrigger className="h-9" aria-label={t("calls.filterStatus")}>
              <SelectValue placeholder={t("calls.filterStatus")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {Object.entries(callStatusMeta).map(([k, m]) => (
                <SelectItem key={k} value={k}>{t(m.key)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={outcome} onValueChange={(v) => { setOutcome(v); setLimit(PAGE); }}>
            <SelectTrigger className="h-9" aria-label={t("calls.filterOutcome")}>
              <SelectValue placeholder={t("calls.filterOutcome")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {Object.entries(outcomeMeta).map(([k, m]) => (
                <SelectItem key={k} value={k}>{t(m.key)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => { setRange(v as DateRange); setLimit(PAGE); }}>
              <SelectTrigger className="h-9 w-full" aria-label={t("calls.filterDate")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                <SelectItem value="today">{t("common.today")}</SelectItem>
                <SelectItem value="7">{t("common.last7")}</SelectItem>
                <SelectItem value="30">{t("common.last30")}</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={resetFilters} aria-label={t("common.reset")}>
                <Filter className="size-4" />
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Desktop table */}
      <Card className="hidden overflow-hidden border-border/70 md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>{t("calls.contactName")}</TableHead>
              <TableHead>{t("common.phone")}</TableHead>
              <TableHead>{t("common.type")}</TableHead>
              <TableHead>{t("common.campaign")}</TableHead>
              <TableHead>{t("common.time")}</TableHead>
              <TableHead>{t("common.duration")}</TableHead>
              <TableHead>{t("common.result")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((c) => {
              const resMeta = c.status === "answered" ? outcomeMeta[c.outcome] : callStatusMeta[c.status];
              const campaignName = campaigns.find((x) => x.id === c.campaignId)?.name ?? "—";
              return (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(c)}
                >
                  <TableCell>
                    <p className="text-[13px] font-medium">{c.contactName}</p>
                    <StatusBadge tone={directionMeta[c.direction].tone} label={t(directionMeta[c.direction].key)} dot={false} className="mt-0.5 scale-90 origin-start" />
                  </TableCell>
                  <TableCell className="tnum" dir="ltr">{c.phone}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">
                    {c.direction === "outbound" ? t("direction.outbound") : t("direction.inbound")}
                  </TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{campaignName}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground tnum">{fmtDateTime(c.startedAt)}</TableCell>
                  <TableCell className="tnum text-[13px]">{fmtDuration(c.durationSec)}</TableCell>
                  <TableCell><StatusBadge tone={resMeta.tone} label={t(resMeta.key)} /></TableCell>
                  <TableCell className="text-end">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setSelected(c); }}>
                      {t("common.details")}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {shown.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={PhoneCall} title={t("calls.noCalls")} desc={t("calls.noCallsDesc")} />
          </div>
        ) : null}
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2.5 md:hidden">
        {shown.map((c) => {
          const resMeta = c.status === "answered" ? outcomeMeta[c.outcome] : callStatusMeta[c.status];
          const campaignName = campaigns.find((x) => x.id === c.campaignId)?.name ?? "—";
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className={cn("block w-full rounded-xl border border-border bg-card p-3.5 text-start transition-colors active:bg-accent")}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{c.contactName}</p>
                <StatusBadge tone={resMeta.tone} label={t(resMeta.key)} />
              </div>
              <p dir="ltr" className="mt-1 text-xs text-muted-foreground tnum">{c.phone}</p>
              <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{campaignName}</span>
                <span aria-hidden="true">·</span>
                <span className="tnum">{fmtDateTime(c.startedAt)}</span>
                <span className="ms-auto tnum">{fmtDuration(c.durationSec)}</span>
              </div>
            </button>
          );
        })}
        {shown.length === 0 ? (
          <EmptyState icon={PhoneCall} title={t("calls.noCalls")} desc={t("calls.noCallsDesc")} />
        ) : null}
      </div>

      {/* Pagination */}
      {filtered.length > limit ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
            <ChevronDown className="size-4" />
            {t("common.showMore")} ({limit}/{filtered.length})
          </Button>
        </div>
      ) : null}

      <CallDetailsSheet
        call={selected}
        open={!!selected}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      />
    </div>
  );
}
