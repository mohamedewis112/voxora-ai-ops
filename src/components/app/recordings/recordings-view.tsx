"use client";

/**
 * Recordings — a placeholder library wired to call data. Playback controls
 * are intentionally disabled: real audio arrives when the telephony backend
 * (Asterisk MixMonitor) is connected. This file doubles as the style
 * reference for list-type views (filters → table → mobile cards → empty).
 */

import { useMemo, useState } from "react";
import { AudioLines, CalendarRange, Download, HardDrive, Search, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { recordingStatusMeta } from "@/lib/status";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatCard } from "@/components/app/shared/stat-card";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function RecordingsView() {
  const { t, fmtDuration, fmtDateTime } = useI18n();
  const calls = useDataStore((s) => s.calls);
  const campaigns = useDataStore((s) => s.campaigns);

  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("all");
  const [status, setStatus] = useState("all");

  const recorded = useMemo(
    () =>
      calls
        .filter((c) => c.status === "answered" && c.durationSec > 0)
        .filter((c) => (campaign === "all" ? true : c.campaignId === campaign))
        .filter((c) => (status === "all" ? true : c.recordingStatus === status))
        .filter((c) => {
          const q = search.trim().toLowerCase();
          return !q || `${c.contactName} ${c.phone}`.toLowerCase().includes(q);
        }),
    [calls, campaign, status, search]
  );

  const storageHrs = Math.round(calls.reduce((a, c) => a + c.durationSec, 0) / 360) / 10;

  const Waveform = ({ id }: { id: string }) => (
    <div className="flex h-8 flex-1 items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => {
        const h = Math.abs(Math.sin(id.charCodeAt(i % id.length) * (i + 5)));
        return <span key={i} className="w-full max-w-[4px] rounded-full bg-muted-foreground/25" style={{ height: `${25 + h * 75}%` }} />;
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader title={t("recordings.title")} desc={t("recordings.desc")} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label={t("recordings.total")} value={recorded.length} icon={AudioLines} tone="info" />
        <StatCard label={t("recordings.storage")} value={`${storageHrs}h`} icon={HardDrive} tone="violet" />
        <StatCard label={t("recordings.retention")} value={t("recordings.retentionVal")} icon={CalendarRange} tone="warning" className="col-span-2 md:col-span-1" />
      </div>

      {/* Filters */}
      <Card className="border-border/70">
        <CardContent className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("common.searchPlaceholder")} className="h-9 ps-9" aria-label={t("common.search")} />
          </div>
          <Select value={campaign} onValueChange={setCampaign}>
            <SelectTrigger className="h-9" aria-label={t("common.campaign")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9" aria-label={t("common.status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {Object.entries(recordingStatusMeta).map(([k, m]) => (
                <SelectItem key={k} value={k}>{t(m.key)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Desktop list */}
      <Card className="hidden overflow-hidden border-border/70 md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-14">{t("recordings.play")}</TableHead>
              <TableHead>{t("calls.contactName")}</TableHead>
              <TableHead>{t("common.phone")}</TableHead>
              <TableHead>{t("common.campaign")}</TableHead>
              <TableHead>{t("common.date")}</TableHead>
              <TableHead className="w-52">{t("recordings.waveform")}</TableHead>
              <TableHead>{t("common.duration")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead className="text-end">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recorded.slice(0, 40).map((c) => {
              const campaignName = campaigns.find((x) => x.id === c.campaignId)?.name ?? "—";
              return (
                <TableRow key={c.id}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => toast.info(t("recordings.playerSoon"))}
                      aria-label={t("recordings.play")}
                      className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform hover:scale-105"
                    >
                      <Volume2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </TableCell>
                  <TableCell className="text-[13px] font-medium">{c.contactName}</TableCell>
                  <TableCell className="tnum text-[13px]" dir="ltr">{c.phone}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground">{campaignName}</TableCell>
                  <TableCell className="text-[13px] text-muted-foreground tnum">{fmtDateTime(c.startedAt)}</TableCell>
                  <TableCell><Waveform id={c.id} /></TableCell>
                  <TableCell className="tnum text-[13px]">{fmtDuration(c.durationSec)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={recordingStatusMeta[c.recordingStatus].tone} label={t(recordingStatusMeta[c.recordingStatus].key)} />
                  </TableCell>
                  <TableCell className="text-end">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => toast.info(t("recordings.playerSoon"))} aria-label={t("recordings.download")}>
                      <Download className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {recorded.length === 0 ? (
          <div className="p-6">
            <EmptyState icon={AudioLines} title={t("common.noResults")} desc={t("common.noResultsDesc")} />
          </div>
        ) : null}
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2.5 md:hidden">
        {recorded.slice(0, 30).map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{c.contactName}</p>
              <StatusBadge tone={recordingStatusMeta[c.recordingStatus].tone} label={t(recordingStatusMeta[c.recordingStatus].key)} />
            </div>
            <p dir="ltr" className="mt-1 text-xs text-muted-foreground tnum">{c.phone}</p>
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => toast.info(t("recordings.playerSoon"))}
                aria-label={t("recordings.play")}
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <Volume2 className="size-4" aria-hidden="true" />
              </button>
              <Waveform id={c.id} />
              <span className="shrink-0 text-xs text-muted-foreground tnum">{fmtDuration(c.durationSec)}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground tnum">{fmtDateTime(c.startedAt)}</p>
          </div>
        ))}
        {recorded.length === 0 ? (
          <EmptyState icon={AudioLines} title={t("common.noResults")} desc={t("common.noResultsDesc")} />
        ) : null}
      </div>
    </div>
  );
}
