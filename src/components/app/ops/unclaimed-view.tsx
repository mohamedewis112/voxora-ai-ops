"use client";

/**
 * Voxora AI — unclaimed businesses view ("الأنشطة غير المرتبطة").
 * Lists Daleely listings with no confirmed owner, grouped by status tabs,
 * with server-side search, owner-candidate linking and admin restore.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CircleX,
  EyeOff,
  GitMerge,
  Link2,
  MoreHorizontal,
  PhoneOff,
  RotateCcw,
  Search,
  SearchX,
  Store,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { useOps, opsPost, notifyOpsChanged } from "@/hooks/use-ops";
import type { ListingDTO, OwnerCandidateDTO } from "@/lib/ops-types";
import type { Tone } from "@/lib/status";
import { PageHeader } from "@/components/app/shared/page-header";
import { EmptyState } from "@/components/app/shared/empty-state";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/* ------------------------------- Types ---------------------------------- */

interface UnclaimedRowDTO extends ListingDTO {
  ownerCandidates: OwnerCandidateDTO[];
  leadAgentName: string | null;
  lastContactAt: string | null;
  leadId: string | null;
}

type TabKey = "unclaimed" | "hidden" | "closed" | "invalid" | "merged";

/* ------------------------------ Constants -------------------------------- */

const TABS: ReadonlyArray<{ value: TabKey; labelKey: string; icon: LucideIcon }> = [
  { value: "unclaimed", labelKey: "unclaimed.filterAll", icon: Store },
  { value: "hidden", labelKey: "unclaimed.filterHidden", icon: EyeOff },
  { value: "closed", labelKey: "unclaimed.filterClosed", icon: CircleX },
  { value: "invalid", labelKey: "unclaimed.filterInvalid", icon: PhoneOff },
  { value: "merged", labelKey: "unclaimed.filterMerged", icon: GitMerge },
];

/** Badge metadata for listing statuses (existing i18n keys, allowed palette). */
const LISTING_STATUS_META: Record<string, { key: string; tone: Tone }> = {
  active: { key: "contactStatus.active", tone: "success" },
  hidden: { key: "unclaimed.filterHidden", tone: "warning" },
  suspended: { key: "unclaimed.filterHidden", tone: "warning" },
  closed_business: { key: "sales.outcome.closed_business", tone: "neutral" },
  invalid_phone: { key: "sales.outcome.invalid_number", tone: "danger" },
  out_of_service: { key: "sales.outcome.out_of_service", tone: "danger" },
  wrong_business_phone: { key: "status.wrong_number", tone: "danger" },
  merged: { key: "merge.status.merged", tone: "violet" },
};

/** hidden / closed / invalid groups are restorable by admins (not merged/active). */
const RESTORABLE_STATUSES = new Set([
  "hidden",
  "suspended",
  "closed_business",
  "invalid_phone",
  "out_of_service",
  "wrong_business_phone",
]);

/* -------------------------------- View ----------------------------------- */

export function UnclaimedView() {
  const { t, fmtDateTime } = useI18n();
  const selectLead = useOpsUiStore((s) => s.selectLead);
  const setView = useUiStore((s) => s.setView);
  const isAdmin = useUiStore((s) => s.account.role) === "admin";

  const [tab, setTab] = useState<TabKey>("unclaimed");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState<string | undefined>(undefined);

  const [linkRow, setLinkRow] = useState<UnclaimedRowDTO | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [linking, setLinking] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Server-side search (debounced).
  useEffect(() => {
    const id = window.setTimeout(() => {
      const v = searchInput.trim();
      setQ(v ? v : undefined);
    }, 350);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const { data, loading, error, refresh } = useOps<UnclaimedRowDTO[]>(
    "unclaimed",
    { status: tab, q },
    { pollMs: 45000 }
  );

  const rows = useMemo<UnclaimedRowDTO[]>(() => data ?? [], [data]);

  // Reset dialog selection each time a row is opened for linking.
  useEffect(() => {
    if (!linkRow) return;
    const timer = window.setTimeout(() => {
      setSelectedIdx(linkRow.ownerCandidates.length > 0 ? 0 : null);
      setLinking(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [linkRow]);

  const linkCands = useMemo<OwnerCandidateDTO[]>(
    () => (linkRow ? [...linkRow.ownerCandidates].sort((a, b) => b.matchScore - a.matchScore) : []),
    [linkRow]
  );

  const topCandidate = (row: UnclaimedRowDTO): OwnerCandidateDTO | null =>
    row.ownerCandidates.length > 0
      ? [...row.ownerCandidates].sort((a, b) => b.matchScore - a.matchScore)[0]
      : null;

  const statusLabel = (row: UnclaimedRowDTO): { label: string; tone: Tone } => {
    const meta = LISTING_STATUS_META[row.status];
    return meta
      ? { label: t(meta.key), tone: meta.tone }
      : { label: row.status, tone: "neutral" };
  };

  const openCustomer = (leadId: string) => {
    selectLead(leadId);
    setView("sales");
  };

  const confirmLink = async () => {
    if (!linkRow?.leadId || selectedIdx === null) return;
    const cand = linkCands[selectedIdx];
    if (!cand) return;
    setLinking(true);
    try {
      await opsPost(`leads/${linkRow.leadId}/link-owner`, {
        listingId: linkRow.id,
        userId: cand.userId ?? null,
        reason: cand.matchReason,
      });
      toast.success(t("unclaimed.linkedToast"));
      setLinkRow(null);
      refresh();
      notifyOpsChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ops.errorLoad"));
    } finally {
      setLinking(false);
    }
  };

  const restoreRow = async (row: UnclaimedRowDTO) => {
    setRestoringId(row.id);
    try {
      await opsPost(`listings/${row.id}/restore`, {});
      toast.success(t("unclaimed.restoredToast"));
      refresh();
      notifyOpsChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ops.errorLoad"));
    } finally {
      setRestoringId(null);
    }
  };

  const emptyIcon: LucideIcon = q ? SearchX : (TABS.find((x) => x.value === tab)?.icon ?? Store);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("unclaimed.title")}
        desc={t("unclaimed.desc")}
        actions={
          <span className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground tnum">
            {rows.length} {t("common.items")}
          </span>
        }
      />

      {/* Tabs + server-side search */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-muted/50 p-1">
            {TABS.map((x) => (
              <TabsTrigger key={x.value} value={x.value} className="gap-1.5 px-3 text-[13px]">
                <x.icon className="size-3.5" aria-hidden="true" />
                {t(x.labelKey)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative lg:w-80">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("ops.searchPhoneOrName")}
            className="h-9 ps-9 pe-8"
            aria-label={t("ops.searchPhoneOrName")}
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t("ops.cancel")}
            >
              <span aria-hidden="true" className="text-sm leading-none">✕</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Stale-poll warning (data still shown) */}
      {error && data ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
          {t("ops.errorLoad")}
        </div>
      ) : null}

      {/* Loading skeleton */}
      {loading && !data ? (
        <Card className="space-y-3 border-border/70 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      ) : null}

      {/* Error state */}
      {error && !data ? (
        <Card className="border-border/70 p-10">
          <div className="flex flex-col items-center gap-3 text-center">
            <TriangleAlert className="size-6 text-rose-500" aria-hidden="true" />
            <p className="text-sm font-medium">{t("ops.errorLoad")}</p>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RotateCcw className="size-4" aria-hidden="true" />
              {t("ops.retry")}
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Data table */}
      {data ? (
        <Card className="overflow-hidden border-border/70">
          <div className="overflow-x-auto">
            <Table className="min-w-[1060px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{t("ops.business")}</TableHead>
                  <TableHead>{t("ops.phone")}</TableHead>
                  <TableHead>{t("unclaimed.category")}</TableHead>
                  <TableHead>{t("unclaimed.location")}</TableHead>
                  <TableHead>{t("unclaimed.ownerCandidate")}</TableHead>
                  <TableHead>{t("wa.salesOwner")}</TableHead>
                  <TableHead>{t("unclaimed.lastContact")}</TableHead>
                  <TableHead>{t("ops.status")}</TableHead>
                  <TableHead className="text-end">{t("ops.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const top = topCandidate(row);
                  const st = statusLabel(row);
                  const canRestore = isAdmin && RESTORABLE_STATUSES.has(row.status);
                  const location = [row.governorate, row.city, row.village]
                    .filter(Boolean)
                    .join("، ");
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <p className="max-w-[220px] truncate text-[13px] font-medium">
                          {row.businessName}
                        </p>
                        {row.ownerName ? (
                          <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground">
                            {row.ownerName}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <p dir="ltr" className="tnum text-[13px] text-start">{row.normalizedPhone}</p>
                        <p dir="ltr" className="tnum mt-0.5 text-[11px] text-muted-foreground text-start">
                          {row.rawPhone}
                        </p>
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">
                        {row.category ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-[13px] text-muted-foreground">
                        {location || "—"}
                      </TableCell>
                      <TableCell>
                        {top ? (
                          <div className="max-w-[220px]">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate text-[13px] font-medium">{top.fullName}</p>
                              <StatusBadge
                                tone="info"
                                dot={false}
                                label={`${top.matchScore}%`}
                                className="shrink-0"
                              />
                            </div>
                            <p
                              className="mt-0.5 truncate text-[11px] text-muted-foreground"
                              title={top.matchReason}
                            >
                              {top.matchReason}
                            </p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">
                        {row.leadAgentName ?? "—"}
                      </TableCell>
                      <TableCell className="tnum text-[13px] text-muted-foreground">
                        {fmtDateTime(row.lastContactAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={st.tone} label={st.label} />
                      </TableCell>
                      <TableCell className="text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={t("common.actions")}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => setLinkRow(row)}>
                              <Link2 className="size-4" aria-hidden="true" />
                              {t("sales.linkOwner")}
                            </DropdownMenuItem>
                            {row.leadId ? (
                              <DropdownMenuItem onClick={() => openCustomer(row.leadId as string)}>
                                <UserRound className="size-4" aria-hidden="true" />
                                {t("unclaimed.openCustomer")}
                              </DropdownMenuItem>
                            ) : null}
                            {canRestore ? (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={restoringId === row.id}
                                  onClick={() => void restoreRow(row)}
                                >
                                  <RotateCcw className="size-4" aria-hidden="true" />
                                  {t("unclaimed.restore")}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {rows.length === 0 && !loading ? (
            <div className="p-6">
              <EmptyState
                icon={emptyIcon}
                title={q ? t("common.noResults") : t("common.noData")}
                desc={q ? t("common.noResultsDesc") : undefined}
              />
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Link owner dialog */}
      <Dialog
        open={!!linkRow}
        onOpenChange={(o) => {
          if (!o) setLinkRow(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-start">{linkRow?.businessName}</DialogTitle>
            <DialogDescription className="text-start">
              {t("sales.linkOwnerDesc")}
            </DialogDescription>
          </DialogHeader>

          {!linkRow?.leadId ? (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {t("sales.noLeads")}
            </div>
          ) : null}

          {linkCands.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              {t("common.noData")}
            </div>
          ) : (
            <RadioGroup
              value={selectedIdx === null ? "" : String(selectedIdx)}
              onValueChange={(v) => setSelectedIdx(Number(v))}
              disabled={!linkRow?.leadId || linking}
              className="grid max-h-72 gap-2 overflow-y-auto pe-1"
            >
              {linkCands.map((c, i) => {
                const inputId = `cand-${linkRow?.id ?? "row"}-${i}`;
                return (
                  <Label
                    key={`${c.normalizedPhone}-${i}`}
                    htmlFor={inputId}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                      selectedIdx === i
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <RadioGroupItem value={String(i)} id={inputId} className="mt-0.5" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1 text-start">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium">{c.fullName}</span>
                        {c.isRegistered ? (
                          <Badge className="border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            {t("ops.registered")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            {t("ops.notRegistered")}
                          </Badge>
                        )}
                      </span>
                      <span dir="ltr" className="tnum text-xs text-muted-foreground">
                        {c.normalizedPhone}
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <StatusBadge tone="info" dot={false} label={`${c.matchScore}%`} />
                        <span className="min-w-0 flex-1 truncate" title={c.matchReason}>
                          {c.matchReason}
                        </span>
                      </span>
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLinkRow(null)} disabled={linking}>
              {t("ops.cancel")}
            </Button>
            <Button
              onClick={() => void confirmLink()}
              disabled={!linkRow?.leadId || selectedIdx === null || linkCands.length === 0 || linking}
            >
              <Link2 className="size-4" aria-hidden="true" />
              {t("unclaimed.link")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
