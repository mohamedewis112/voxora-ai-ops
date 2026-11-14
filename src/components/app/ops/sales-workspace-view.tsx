"use client";

/**
 * Voxora AI — Sales workspace (مساحة عمل المبيعات).
 * Assigned leads per employee + outcome actions + callbacks + WhatsApp + notes.
 * The unified lead sheet handles all lead-level actions.
 */
import { useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, MoreHorizontal, RefreshCcw, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { notifyOpsChanged, opsPost, useOps } from "@/hooks/use-ops";
import { LeadSheet } from "./lead-sheet";
import { ManagerLeadSheet } from "./manager-lead-sheet";
import { PageHeader } from "../shared/page-header";
import { EmptyState } from "../shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AgentDTO, LeadDTO } from "@/lib/ops-types";

const STATUS_TONE: Record<string, string> = {
  new: "bg-zinc-500/15 text-zinc-400", assigned: "bg-zinc-500/15 text-zinc-300",
  queued: "bg-amber-500/15 text-amber-500", calling: "bg-violet-500/15 text-violet-400",
  busy: "bg-amber-500/15 text-amber-500", no_answer: "bg-zinc-500/15 text-zinc-400",
  switched_off: "bg-zinc-500/15 text-zinc-400", invalid_number: "bg-rose-500/15 text-rose-500",
  out_of_service: "bg-rose-500/15 text-rose-500", callback: "bg-violet-500/15 text-violet-400",
  interested: "bg-emerald-500/15 text-emerald-500", not_interested: "bg-rose-500/15 text-rose-500",
  whatsapp_followup: "bg-teal-500/15 text-teal-500", linked: "bg-emerald-500/20 text-emerald-400",
  closed_business: "bg-rose-500/15 text-rose-500", completed: "bg-emerald-500/15 text-emerald-500",
  transferred_to_sales: "bg-amber-500/15 text-amber-500",
};

function leadLabel(l: LeadDTO): string {
  return l.businessName || l.customerName || l.normalizedPhone;
}

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} س`;
  return `قبل ${Math.floor(hours / 24)} ي`;
}

interface TransferResult {
  transferredCount: number;
  skippedCount: number;
  newAgentId: string;
  newAgentName: string;
  transferredLeadIds: string[];
}

const TRANSFER_ERRORS: Record<string, string> = {
  missing_leads: "اختر عميلًا واحدًا على الأقل",
  missing_target_agent: "اختر الموظفة الجديدة",
  lead_not_found: "أحد العملاء لم يعد موجودًا",
  lead_unassigned: "أحد العملاء غير مسند لموظفة حاليًا",
  target_agent_not_found: "الموظفة الجديدة غير موجودة",
  target_agent_inactive: "الموظفة الجديدة غير نشطة",
  target_agent_cannot_receive_leads: "الموظفة الجديدة غير متاحة لاستقبال العملاء",
  same_agent: "العملاء المحددون موجودون بالفعل لدى هذه الموظفة",
  forbidden: "ليس لديك صلاحية نقل العملاء",
};

export function SalesWorkspaceView() {
  const { t, fmtDateTime } = useI18n();
  const setView = useUiStore((s) => s.setView);
  const account = useUiStore((s) => s.account);
  const isSales = account.role === "sales_agent";
  const selectLead = useOpsUiStore((s) => s.selectLead);

  const [agentFilter, setAgentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [prefixFilter, setPrefixFilter] = useState("all");
  const [q, setQ] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickPhone, setQuickPhone] = useState("");
  const [quickName, setQuickName] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferLeadIds, setTransferLeadIds] = useState<string[]>([]);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferBusy, setTransferBusy] = useState(false);

  const { data: agents, refresh: refreshAgents } = useOps<AgentDTO[]>("agents");
  const { data: leads, loading, error, refresh } = useOps<LeadDTO[]>(
    "leads",
    { agentId: !isSales && agentFilter !== "all" ? agentFilter : undefined, status: statusFilter, prefix: prefixFilter, q },
    { pollMs: 30000 }
  );

  const chips = useMemo(() => {
    const rows = leads ?? [];
    return {
      total: rows.length,
      interested: rows.filter((r) => r.status === "interested").length,
      callbacks: rows.filter((r) => r.status === "callback").length,
      whatsapp: rows.filter((r) => r.status === "whatsapp_followup").length,
      linked: rows.filter((r) => r.status === "linked").length,
      busy: rows.filter((r) => r.status === "busy").length,
      noAnswer: rows.filter((r) => r.status === "no_answer").length,
    };
  }, [leads]);

  const openLead = (l: LeadDTO) => {
    selectLead(l.id);
    // stay in this view — the sheet renders here
    setView("sales");
  };

  const quickAdd = async () => {
    setBusy(true);
    try {
      await opsPost("leads", { phone: quickPhone, businessName: quickName, source: "admin" });
      toast.success(t("pipeline.autoEntry"));
      setQuickOpen(false);
      setQuickPhone("");
      setQuickName("");
      refresh();
      notifyOpsChanged();
    } catch (e) {
      toast.error(e instanceof Error && e.message === "invalid_phone" ? "رقم الهاتف غير صالح" : t("ops.errorLoad"));
    } finally {
      setBusy(false);
    }
  };

  const activeAgents = (agents ?? []).filter((a) => a.status === "active");
  const transferAgents = activeAgents.filter((a) => a.canReceiveLeads);
  const visibleLeadIds = (leads ?? []).map((lead) => lead.id);
  const selectedVisibleCount = visibleLeadIds.filter((id) => selectedLeadIds.has(id)).length;
  const allVisibleSelected = visibleLeadIds.length > 0 && selectedVisibleCount === visibleLeadIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const transferRows = transferLeadIds
    .map((id) => (leads ?? []).find((lead) => lead.id === id))
    .filter((lead): lead is LeadDTO => Boolean(lead));
  const targetAgent = transferAgents.find((agent) => agent.id === transferTarget) ?? null;
  const eligibleTransferCount = transferRows.filter(
    (lead) => lead.assignedAgentId && lead.assignedAgentId !== transferTarget
  ).length;
  const sameTargetCount = transferRows.filter((lead) => lead.assignedAgentId === transferTarget).length;
  const sourceAgentNames = [...new Set(transferRows.map((lead) => lead.agentName).filter(Boolean))] as string[];

  const clearSelection = () => setSelectedLeadIds(new Set());

  const toggleLeadSelection = (leadId: string, checked: boolean) => {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      if (checked) next.add(leadId);
      else next.delete(leadId);
      return next;
    });
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedLeadIds((current) => {
      const next = new Set(current);
      for (const id of visibleLeadIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const openTransfer = (ids: string[]) => {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      toast.error(TRANSFER_ERRORS.missing_leads);
      return;
    }
    setTransferLeadIds(uniqueIds);
    setTransferTarget("");
    setTransferReason("");
    setTransferOpen(true);
  };

  const submitTransfer = async () => {
    if (transferBusy || !transferTarget || transferLeadIds.length === 0 || eligibleTransferCount === 0) return;
    setTransferBusy(true);
    try {
      const result = await opsPost<TransferResult>("leads/transfer", {
        leadIds: transferLeadIds,
        newAgentId: transferTarget,
        reason: transferReason.trim() || undefined,
      });
      toast.success(`تم نقل ${result.transferredCount} عميلًا بنجاح إلى ${result.newAgentName}`);
      setTransferOpen(false);
      setTransferLeadIds([]);
      setTransferTarget("");
      setTransferReason("");
      clearSelection();
      refresh();
      refreshAgents();
      notifyOpsChanged();
    } catch (e) {
      const message = e instanceof Error ? e.message : "manager_transfer_error";
      toast.error(TRANSFER_ERRORS[message] ?? "تعذر نقل العملاء. حاول مرة أخرى");
    } finally {
      setTransferBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("nav.sales")}
        desc={t("sales.desc")}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={refresh} aria-label={t("ops.retry")}>
              <RefreshCcw className="size-4" aria-hidden="true" />
            </Button>

          </div>
        }
      />

      {/* Agent selector */}
      <div className="flex flex-wrap items-center gap-2">
        {!isSales && (
          <Select value={agentFilter} onValueChange={(value) => { setAgentFilter(value); clearSelection(); }}>
            <SelectTrigger className="h-9 w-[220px]" aria-label={t("ops.agent")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("sales.allAgents")}</SelectItem>
              {activeAgents.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); clearSelection(); }}>
          <SelectTrigger className="h-9 w-[170px]" aria-label={t("ops.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {["new", "assigned", "busy", "no_answer", "switched_off", "invalid_number", "out_of_service", "interested", "not_interested", "callback", "whatsapp_followup", "linked", "closed_business"].map((s) => (
              <SelectItem key={s} value={s}>{t(`sales.outcome.${s}`) !== `sales.outcome.${s}` ? t(`sales.outcome.${s}`) : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={prefixFilter} onValueChange={(value) => { setPrefixFilter(value); clearSelection(); }}>
          <SelectTrigger className="h-9 w-[130px]" aria-label={t("pipeline.prefix")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pipeline.prefix")}: {t("common.all")}</SelectItem>
            {["010", "011", "012", "015", "02"].map((p) => (
              <SelectItem key={p} value={p} className="tnum">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); clearSelection(); }}
          placeholder={t("ops.searchPhoneOrName")}
          className="h-9 w-full max-w-[260px]"
        />
      </div>

      {/* Outcome chips */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(
          [
            ["total", chips.total, "bg-zinc-500/15 text-zinc-300"],
            ["interested", chips.interested, "bg-emerald-500/15 text-emerald-500"],
            ["callback", chips.callbacks, "bg-violet-500/15 text-violet-400"],
            ["whatsapp_followup", chips.whatsapp, "bg-teal-500/15 text-teal-500"],
            ["linked", chips.linked, "bg-emerald-500/20 text-emerald-400"],
            ["busy", chips.busy, "bg-amber-500/15 text-amber-500"],
            ["no_answer", chips.noAnswer, "bg-zinc-500/15 text-zinc-400"],
          ] as const
        ).map(([key, value, tone]) => (
          <span key={key} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium", tone)}>
            {t(`sales.outcome.${key}`) !== `sales.outcome.${key}` ? t(`sales.outcome.${key}`) : key}
            <span className="tnum font-bold">{value}</span>
          </span>
        ))}
      </div>

      {!isSales && selectedLeadIds.size > 0 && (
        <div className="sticky top-3 z-30 flex flex-col gap-3 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">تم تحديد <span className="tnum">{selectedLeadIds.size}</span> عميل</p>
            <p className="text-xs text-muted-foreground">يمكن نقل العملاء المحددين إلى موظفة أخرى دفعة واحدة.</p>
          </div>
          <Button size="sm" onClick={() => openTransfer([...selectedLeadIds])}>
            <ArrowLeftRight className="size-4" aria-hidden="true" />
            نقل العملاء
          </Button>
        </div>
      )}

      {/* Leads table */}
      <Card>
        <CardContent className="p-0">
          {loading && !leads ? (
            <div className="space-y-2 p-4" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 p-10" role="alert">
              <p className="text-sm text-rose-400">{t("ops.errorLoad")}</p>
              <Button size="sm" variant="outline" onClick={refresh}>{t("ops.retry")}</Button>
            </div>
          ) : (leads ?? []).length === 0 ? (
            <EmptyState icon={UserCheck} title={t("sales.noLeads")} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {!isSales && (
                      <TableHead className="w-12">
                        <Checkbox
                          checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                          onCheckedChange={(checked) => toggleVisibleSelection(checked === true)}
                          aria-label="تحديد كل النتائج الحالية"
                        />
                      </TableHead>
                    )}
                    <TableHead className="text-start">{t("ops.customer")}</TableHead>
                    <TableHead className="text-start">{t("ops.phone")}</TableHead>
                    <TableHead className="text-start">{t("pipeline.prefix")}</TableHead>
                    <TableHead className="text-start">{t("ops.status")}</TableHead>
                    <TableHead className="text-start">{t("ops.agent")}</TableHead>
                    <TableHead className="text-start">{t("ops.lastActivity")}</TableHead>
                    <TableHead className="text-start">{t("ops.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(leads ?? []).map((l) => (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer"
                      onClick={() => openLead(l)}
                    >
                      {!isSales && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedLeadIds.has(l.id)}
                            onCheckedChange={(checked) => toggleLeadSelection(l.id, checked === true)}
                            aria-label={`تحديد ${leadLabel(l)}`}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <span className="block max-w-[220px] truncate text-[13px] font-medium">{leadLabel(l)}</span>
                        {l.userRegistered && (
                          <Badge variant="secondary" className="mt-1 bg-emerald-500/15 text-[10px] text-emerald-400">
                            {t("ops.registered")}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell><span className="tnum text-[13px] text-muted-foreground" dir="ltr">{l.normalizedPhone}</span></TableCell>
                      <TableCell>{l.prefix ? <Badge variant="outline" className="tnum">{l.prefix}</Badge> : "—"}</TableCell>
                      <TableCell>
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[l.status] ?? "bg-muted")}>
                          {t(`sales.outcome.${l.status}`) !== `sales.outcome.${l.status}` ? t(`sales.outcome.${l.status}`) : l.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-[13px] text-muted-foreground">{l.agentName ?? "—"}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground tnum" title={fmtDateTime(l.updatedAt)}>
                        {relative(l.updatedAt)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {isSales ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => openLead(l)}
                            aria-label={t("ops.openLead")}
                          >
                            {t("ops.openLead")}
                          </Button>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                aria-label={`إجراءات ${leadLabel(l)}`}
                              >
                                <MoreHorizontal className="size-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => openLead(l)}>
                                {t("ops.openLead")}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openTransfer([l.id])}>
                                <ArrowLeftRight className="size-4" aria-hidden="true" />
                                نقل إلى موظفة أخرى
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {!isSales && (
        <Dialog
          open={transferOpen}
          onOpenChange={(open) => {
            if (transferBusy) return;
            setTransferOpen(open);
            if (!open) {
              setTransferLeadIds([]);
              setTransferTarget("");
              setTransferReason("");
            }
          }}
        >
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{transferLeadIds.length > 1 ? "نقل العملاء" : "نقل إلى موظفة أخرى"}</DialogTitle>
              <DialogDescription>
                {transferLeadIds.length > 1
                  ? `سيتم تجهيز ${transferLeadIds.length} عميل للنقل. العملاء الموجودون بالفعل لدى الموظفة الهدف سيتم تجاهلهم.`
                  : "اختر الموظفة الجديدة. لن يتم تغيير الموظفة الأصلية المسجلة تاريخيًا للعميل."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  {transferLeadIds.length > 1 ? "الموظفة الحالية" : "الموظفة الحالية"}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {sourceAgentNames.length > 0 ? sourceAgentNames.join("، ") : "غير محددة"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="transfer-target">الموظفة الجديدة</Label>
                <Select value={transferTarget} onValueChange={setTransferTarget} disabled={transferBusy}>
                  <SelectTrigger id="transfer-target">
                    <SelectValue placeholder="اختر الموظفة الهدف" />
                  </SelectTrigger>
                  <SelectContent>
                    {transferAgents
                      .filter((agent) => transferRows.some((lead) => lead.assignedAgentId !== agent.id))
                      .map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="transfer-reason">سبب النقل <span className="text-xs font-normal text-muted-foreground">(اختياري)</span></Label>
                <Input
                  id="transfer-reason"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                  disabled={transferBusy}
                  placeholder="مثال: إعادة توزيع الحمل"
                />
              </div>

              {targetAgent && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                  <p className="font-medium">
                    سيتم نقل <span className="tnum">{eligibleTransferCount}</span> عميلًا إلى {targetAgent.name}
                  </p>
                  {sameTargetCount > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      سيتم تجاهل <span className="tnum">{sameTargetCount}</span> عميل موجود بالفعل لدى الموظفة الهدف.
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setTransferOpen(false)}
                disabled={transferBusy}
              >
                إلغاء
              </Button>
              <Button
                onClick={() => { void submitTransfer(); }}
                disabled={transferBusy || !transferTarget || eligibleTransferCount === 0}
              >
                {transferBusy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ArrowLeftRight className="size-4" aria-hidden="true" />}
                {transferBusy ? "جارٍ النقل..." : "تأكيد النقل"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Quick add phone dialog (auto pipeline entry) */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{t("pipeline.tryAdd")}</DialogTitle>
            <p className="text-sm text-muted-foreground">{t("pipeline.autoEntry")}</p>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("ops.phone")}</Label>
              <Input
                value={quickPhone}
                onChange={(e) => setQuickPhone(e.target.value)}
                placeholder="01012345678"
                dir="ltr"
                className="mt-1.5 tnum"
              />
            </div>
            <div>
              <Label>{t("ops.business")}</Label>
              <Input value={quickName} onChange={(e) => setQuickName(e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setQuickOpen(false)}>{t("ops.cancel")}</Button>
            <Button disabled={!quickPhone.trim() || busy} onClick={quickAdd}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {t("ops.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified lead detail sheet */}
      {isSales ? <LeadSheet /> : <ManagerLeadSheet />}
    </div>
  );
}
