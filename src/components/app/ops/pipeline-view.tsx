"use client";

/**
 * Pipeline & Distribution view (خط المبيعات والتوزيع).
 * - Overview stats (total + per-prefix counts + pending merges + unclaimed), polled every 30s.
 * - Distribution table: leads per agent per prefix with a simple balance bar.
 * - Team management: disable/activate, reassign open leads, change role, add employee.
 * - All-leads table with prefix/status/search filters; row click opens the lead in the sales workspace.
 * Mutations go through opsPost + refresh + notifyOpsChanged (shared refresh bus).
 */

import { useState } from "react";
import {
  GitMerge,
  Hash,
  Inbox,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Store,
  TriangleAlert,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useI18n } from "@/lib/i18n";
import { opsPost, notifyOpsChanged, useOps } from "@/hooks/use-ops";
import type { AgentDTO, LeadDTO, OpsOverviewDTO } from "@/lib/ops-types";
import type { Tone } from "@/lib/status";
import { cn } from "@/lib/utils";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { useUiStore } from "@/stores/ui-store";

import { PageHeader } from "@/components/app/shared/page-header";
import { StatCard } from "@/components/app/shared/stat-card";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* ------------------------------- constants ------------------------------- */

const PREFIXES = ["010", "011", "012", "015"] as const;
const PREFIX_TONES: Tone[] = ["info", "violet", "success", "warning"];
const STATUS_FILTERS = [
  "new", "assigned", "busy", "no_answer", "interested", "not_interested",
  "callback", "whatsapp_followup", "linked", "closed_business",
] as const;
const ROLE_OPTIONS = ["sales", "manager", "viewer", "admin"] as const;
const SKELETON_ROWS = [0, 1, 2, 3, 4] as const;

interface AgentRowDTO extends AgentDTO {
  activeLeads: number;
}

/** Lead status → badge tone (emerald/violet/amber/rose/teal/zinc only — no blue). */
const STATUS_TONE: Record<string, Tone> = {
  new: "neutral",
  assigned: "neutral",
  queued: "neutral",
  calling: "violet",
  ringing: "violet",
  answered: "success",
  busy: "warning",
  no_answer: "neutral",
  switched_off: "neutral",
  invalid_number: "danger",
  out_of_service: "danger",
  callback: "violet",
  interested: "success",
  not_interested: "danger",
  whatsapp_followup: "info",
  transferred_to_sales: "violet",
  linked: "success",
  closed_business: "danger",
  completed: "success",
  failed: "danger",
};

/** Lead status → i18n key. Missing keys fall back to the humanized raw status. */
const STATUS_LABEL_KEY: Record<string, string> = {
  new: "common.new",
  busy: "status.busy",
  no_answer: "status.no_answer",
  interested: "sales.outcome.interested",
  not_interested: "sales.outcome.not_interested",
  callback: "sales.outcome.callback",
  whatsapp_followup: "sales.outcome.whatsapp_followup",
  linked: "sales.outcome.linked",
  closed_business: "sales.outcome.closed_business",
  switched_off: "sales.outcome.switched_off",
  invalid_number: "sales.outcome.invalid_number",
  out_of_service: "sales.outcome.out_of_service",
  completed: "common.done",
};

/** Agent role → i18n key. Missing keys fall back to the raw role string. */
const ROLE_LABEL_KEY: Record<string, string> = {
  admin: "role.admin",
  manager: "role.manager",
  sales: "role.sales_agent",
  sales_agent: "role.sales_agent",
  viewer: "role.viewer",
};

/** Server error key → exact Arabic message for the quick-add dialog. */
const QUICK_ADD_ERRORS: Record<string, string> = {
  invalid_phone: "رقم غير صالح",
  missing_name: "أدخل الاسم",
};

/* --------------------------------- view --------------------------------- */

export function PipelineView() {
  const { t, fmtDateTime } = useI18n();
  const selectLead = useOpsUiStore((s) => s.selectLead);
  const setView = useUiStore((s) => s.setView);

  /* ------- data (overview polls every 30s) ------- */
  const overview = useOps<OpsOverviewDTO>("overview", undefined, { pollMs: 30000 });
  const agents = useOps<AgentRowDTO[]>("agents");

  const [prefixFilter, setPrefixFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const leads = useOps<LeadDTO[]>("leads", {
    prefix: prefixFilter,
    status: statusFilter,
    q: search.trim() || undefined,
  });

  const ov = overview.data;
  const maxTotal = ov && ov.distribution.length > 0
    ? Math.max(1, ...ov.distribution.map((r) => r.total))
    : 1;

  const statusLabel = (s: string): string => {
    const key = STATUS_LABEL_KEY[s];
    return key ? t(key) : s.replace(/_/g, " ");
  };
  const roleLabel = (r: string): string => {
    const key = ROLE_LABEL_KEY[r];
    return key ? t(key) : r;
  };
  const agentStatusLabel = (s: string): string =>
    s === "active" ? t("agentStatus.ready") : t("agentStatus.offline");

  /** Relative-ish last update: under an hour → "قبل دقائق", otherwise absolute. */
  const lastUpdate = (iso: string): string => {
    const ms = Date.now() - new Date(iso).getTime();
    if (Number.isFinite(ms) && ms >= 0 && ms < 60 * 60_000) return t("ops.minutesAgo");
    return fmtDateTime(iso);
  };

  const refreshAll = () => {
    overview.refresh();
    agents.refresh();
    leads.refresh();
    notifyOpsChanged();
  };

  const openLead = (leadId: string) => {
    selectLead(leadId);
    setView("sales");
  };

  /* ------- quick add dialog ------- */
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickPhone, setQuickPhone] = useState("");
  const [quickBusiness, setQuickBusiness] = useState("");
  const [quickCampaign, setQuickCampaign] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);

  const submitQuickAdd = async () => {
    if (quickBusy) return;
    if (!quickPhone.trim()) {
      toast.error(QUICK_ADD_ERRORS.invalid_phone);
      return;
    }
    setQuickBusy(true);
    try {
      await opsPost("leads", {
        phone: quickPhone.trim(),
        businessName: quickBusiness.trim() || undefined,
        campaign: quickCampaign.trim() || undefined,
      });
      toast.success(t("pipeline.autoEntry"));
      setQuickOpen(false);
      setQuickPhone("");
      setQuickBusiness("");
      setQuickCampaign("");
      refreshAll();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "ops_error";
      toast.error(QUICK_ADD_ERRORS[msg] ?? msg);
    } finally {
      setQuickBusy(false);
    }
  };

  /* ------- add employee dialog ------- */
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState<string>("sales");
  const [addPhone, setAddPhone] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const submitEmployee = async () => {
    if (addBusy) return;
    if (!addName.trim()) {
      toast.error(t("common.required"));
      return;
    }
    setAddBusy(true);
    try {
      await opsPost("agents", {
        name: addName.trim(),
        role: addRole,
        phone: addPhone.trim() || undefined,
      });
      toast.success(t("pipeline.employeeAdded"));
      setAddOpen(false);
      setAddName("");
      setAddPhone("");
      setAddRole("sales");
      refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ops_error");
    } finally {
      setAddBusy(false);
    }
  };

  /* ------- agent actions ------- */
  const [actingId, setActingId] = useState<string | null>(null);

  const agentAction = async (
    id: string,
    action: "disable" | "activate" | "reassign-open"
  ) => {
    setActingId(id);
    try {
      await opsPost(`agents/${id}/action`, { action });
      if (action === "disable") toast.success(t("pipeline.disabledToast"));
      else if (action === "activate") toast.success(t("common.savedToast"));
      else toast.success(t("pipeline.reassignedToast"));
      refreshAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ops_error");
    } finally {
      setActingId(null);
    }
  };

  const changeRole = async (id: string, role: string) => {
    setActingId(id);
    try {
      await opsPost(`agents/${id}/action`, { action: "set-role", role });
      toast.success(t("pipeline.roleChanged"));
      agents.refresh();
      notifyOpsChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ops_error");
    } finally {
      setActingId(null);
    }
  };

  const retryButton = (onClick: () => void) => (
    <Button variant="outline" size="sm" onClick={onClick}>
      <RotateCcw className="size-4" aria-hidden="true" />
      {t("ops.retry")}
    </Button>
  );

  const errorBox = (msg: string, onRetry: () => void) => (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-rose-500/10 text-rose-500 dark:text-rose-400">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm text-muted-foreground">{t("ops.errorLoad")}</p>
      {msg ? <p className="font-mono text-xs text-muted-foreground/80">{msg}</p> : null}
      {retryButton(onRetry)}
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("nav.pipeline")}
        desc={t("pipeline.desc")}
        actions={
          <Button onClick={() => setQuickOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t("pipeline.tryAdd")}
          </Button>
        }
      />

      {/* ------------------------- Stats row ------------------------- */}
      <section aria-label={t("pipeline.totalLeads")}>
        {overview.error && !ov ? (
          <Card className="border-border/70">{errorBox(overview.error, () => overview.refresh())}</Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {!ov ? (
              SKELETON_ROWS.map((i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)
            ) : (
              <>
                <StatCard
                  label={t("pipeline.totalLeads")}
                  value={ov.totalLeads}
                  icon={Users}
                  tone="violet"
                />
                {PREFIXES.map((p, i) => (
                  <StatCard
                    key={p}
                    label={`${t("pipeline.prefix")} ${p}`}
                    value={ov.leadsByPrefix[p] ?? 0}
                    icon={Hash}
                    tone={PREFIX_TONES[i] ?? "neutral"}
                  />
                ))}
                <StatCard
                  label={t("overview.pendingMerges")}
                  value={ov.pendingMerges}
                  icon={GitMerge}
                  tone="warning"
                />
                <StatCard
                  label={t("overview.unclaimed")}
                  value={ov.unclaimedCount}
                  icon={Store}
                  tone="neutral"
                />
              </>
            )}
          </div>
        )}
      </section>

      {/* ---------------------- Distribution panel ---------------------- */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-base">{t("pipeline.distribution")}</CardTitle>
          <CardDescription>{t("pipeline.autoEntry")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-1">
          {overview.error && !ov ? (
            errorBox(overview.error, () => overview.refresh())
          ) : !ov ? (
            <div className="space-y-2 px-4 pb-4">
              {SKELETON_ROWS.map((i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : ov.distribution.length === 0 ? (
            <div className="px-4 pb-4">
              <EmptyState icon={Users} title={t("common.noData")} />
            </div>
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{t("ops.agent")}</TableHead>
                  {PREFIXES.map((p) => (
                    <TableHead key={p} className="tnum">{p}</TableHead>
                  ))}
                  <TableHead className="tnum">{t("pipeline.totalLeads")}</TableHead>
                  <TableHead className="min-w-[140px]">{t("pipeline.fairness")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ov.distribution.map((row) => {
                  const active = row.status === "active";
                  const share = Math.round((row.total / maxTotal) * 100);
                  return (
                    <TableRow key={row.agentId} className={cn(!active && "opacity-60")}>
                      <TableCell>
                        <p className="text-[13px] font-medium">{row.agentName}</p>
                        <StatusBadge
                          tone={active ? "success" : "warning"}
                          label={agentStatusLabel(row.status)}
                          dot={true}
                          className="mt-0.5 scale-90 origin-start"
                        />
                      </TableCell>
                      {PREFIXES.map((p) => (
                        <TableCell key={p} className="tnum text-[13px] text-muted-foreground">
                          {row.counts[p] ?? 0}
                        </TableCell>
                      ))}
                      <TableCell className="tnum text-[13px] font-medium">{row.total}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={share} className="h-2 flex-1" aria-label={`${row.agentName}: ${share}%`} />
                          <span className="w-10 text-end text-xs text-muted-foreground tnum">{share}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ----------------------- Team management ----------------------- */}
      <Card className="border-border/70">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("perf.salesTeam")}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus className="size-4" aria-hidden="true" />
            {t("pipeline.addEmployee")}
          </Button>
        </CardHeader>
        <CardContent className="p-0 pb-1">
          {agents.error && !agents.data ? (
            errorBox(agents.error, () => agents.refresh())
          ) : !agents.data ? (
            <div className="space-y-2 px-4 pb-4">
              {SKELETON_ROWS.map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : agents.data.length === 0 ? (
            <div className="px-4 pb-4">
              <EmptyState icon={Users} title={t("common.noData")} />
            </div>
          ) : (
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead>{t("common.name")}</TableHead>
                  <TableHead>{t("pipeline.employeeRole")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead className="tnum">{t("pipeline.leadsCount")}</TableHead>
                  <TableHead className="text-end">{t("ops.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.data.map((a) => {
                  const active = a.status === "active";
                  return (
                    <TableRow key={a.id} className={cn(actingId === a.id && "opacity-60", !active && "opacity-60")}>
                      <TableCell>
                        <p className={cn("text-[13px] font-medium", !active && "text-muted-foreground")}>{a.name}</p>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={a.role}
                          onValueChange={(v) => { void changeRole(a.id, v); }}
                        >
                          <SelectTrigger
                            className="h-8 w-[130px] text-xs"
                            aria-label={`${t("pipeline.employeeRole")}: ${a.name}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={active ? "success" : "warning"}
                          label={agentStatusLabel(a.status)}
                        />
                      </TableCell>
                      <TableCell className="tnum text-[13px]">{a.activeLeads}</TableCell>
                      <TableCell className="text-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`${t("ops.actions")}: ${a.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            {active ? (
                              <DropdownMenuItem
                                onClick={() => { void agentAction(a.id, "disable"); }}
                                className="text-rose-600 focus:text-rose-600 dark:text-rose-400 dark:focus:text-rose-400"
                              >
                                {t("pipeline.disable")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => { void agentAction(a.id, "activate"); }}>
                                {t("pipeline.activate")}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => { void agentAction(a.id, "reassign-open"); }}>
                              {t("pipeline.reassign")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ------------------------- All leads ------------------------- */}
      <Card className="border-border/70">
        <CardContent className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          <div className="relative col-span-2 sm:col-span-1">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("ops.searchPhoneOrName")}
              className="h-9 ps-9"
              aria-label={t("ops.search")}
            />
          </div>
          <Select value={prefixFilter} onValueChange={setPrefixFilter}>
            <SelectTrigger className="h-9" aria-label={t("pipeline.prefix")}>
              <SelectValue placeholder={t("pipeline.prefix")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {PREFIXES.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9" aria-label={t("ops.status")}>
              <SelectValue placeholder={t("ops.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        {leads.error && !leads.data ? (
          errorBox(leads.error, () => leads.refresh())
        ) : !leads.data ? (
          <div className="space-y-2 p-4">
            {SKELETON_ROWS.map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : leads.data.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Inbox}
              title={t("common.noResults")}
              desc={t("common.noResultsDesc")}
            />
          </div>
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>{t("ops.customer")} / {t("ops.business")}</TableHead>
                <TableHead>{t("common.phone")}</TableHead>
                <TableHead>{t("pipeline.prefix")}</TableHead>
                <TableHead>{t("ops.status")}</TableHead>
                <TableHead>{t("ops.agent")}</TableHead>
                <TableHead>{t("ops.lastActivity")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.data.map((l) => {
                const tone = STATUS_TONE[l.status] ?? "neutral";
                const linked = l.status === "linked";
                const completed = l.status === "completed";
                return (
                  <TableRow
                    key={l.id}
                    className="cursor-pointer"
                    onClick={() => openLead(l.id)}
                    aria-label={`${t("ops.openLead")}: ${l.businessName || l.customerName || l.normalizedPhone}`}
                  >
                    <TableCell>
                      <p className="max-w-[220px] truncate text-[13px] font-medium">
                        {l.businessName || l.customerName || "—"}
                      </p>
                      {l.campaign ? (
                        <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-muted-foreground">
                          {l.campaign}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="tnum" dir="ltr">{l.normalizedPhone}</TableCell>
                    <TableCell>
                      {l.prefix ? (
                        <Badge variant="outline" className="tnum">{l.prefix}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={tone}
                        label={statusLabel(l.status)}
                        dot={!completed}
                        className={cn(
                          linked && "border-transparent bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white"
                        )}
                      />
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground">
                      {l.agentName ?? "—"}
                    </TableCell>
                    <TableCell className="text-[13px] text-muted-foreground tnum">
                      {lastUpdate(l.updatedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* --------------------- Quick add dialog --------------------- */}
      <Dialog open={quickOpen} onOpenChange={(o) => { if (!quickBusy) setQuickOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pipeline.tryAdd")}</DialogTitle>
            <DialogDescription>{t("pipeline.autoEntry")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <label htmlFor="quick-phone" className="text-sm font-medium">{t("ops.phone")}</label>
              <Input
                id="quick-phone"
                dir="ltr"
                inputMode="tel"
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="tnum"
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="quick-business" className="text-sm font-medium">
                {t("common.business")} <span className="text-xs font-normal text-muted-foreground">({t("common.optional")})</span>
              </label>
              <Input
                id="quick-business"
                value={quickBusiness}
                onChange={(e) => setQuickBusiness(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="quick-campaign" className="text-sm font-medium">
                {t("common.campaign")} <span className="text-xs font-normal text-muted-foreground">({t("common.optional")})</span>
              </label>
              <Input
                id="quick-campaign"
                value={quickCampaign}
                onChange={(e) => setQuickCampaign(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setQuickOpen(false)} disabled={quickBusy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => { void submitQuickAdd(); }} disabled={quickBusy}>
              {quickBusy ? t("ops.loading") : t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------- Add employee dialog --------------------- */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!addBusy) setAddOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("pipeline.addEmployee")}</DialogTitle>
            <DialogDescription>{t("pipeline.desc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="grid gap-1.5">
              <label htmlFor="agent-name" className="text-sm font-medium">{t("pipeline.employeeName")}</label>
              <Input
                id="agent-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="agent-role" className="text-sm font-medium">{t("pipeline.employeeRole")}</label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger id="agent-role" aria-label={t("pipeline.employeeRole")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="agent-phone" className="text-sm font-medium">
                {t("pipeline.employeePhone")} <span className="text-xs font-normal text-muted-foreground">({t("common.optional")})</span>
              </label>
              <Input
                id="agent-phone"
                dir="ltr"
                inputMode="tel"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="tnum"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBusy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => { void submitEmployee(); }} disabled={addBusy}>
              {addBusy ? t("ops.loading") : t("common.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
