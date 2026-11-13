"use client";

/**
 * Voxora AI — Sales workspace (مساحة عمل المبيعات).
 * Assigned leads per employee + outcome actions + callbacks + WhatsApp + notes.
 * The unified lead sheet handles all lead-level actions.
 */
import { useMemo, useState } from "react";
import { Loader2, Plus, RefreshCcw, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useUiStore } from "@/stores/ui-store";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { notifyOpsChanged, opsPost, useOps } from "@/hooks/use-ops";
import { LeadSheet } from "./lead-sheet";
import { PageHeader } from "../shared/page-header";
import { EmptyState } from "../shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

  const { data: agents } = useOps<AgentDTO[]>("agents");
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
            {!isSales && (
              <Button size="sm" onClick={() => setQuickOpen(true)}>
                <Plus className="size-4" aria-hidden="true" /> {t("pipeline.tryAdd")}
              </Button>
            )}
          </div>
        }
      />

      {/* Agent selector */}
      <div className="flex flex-wrap items-center gap-2">
        {!isSales && (
          <Select value={agentFilter} onValueChange={setAgentFilter}>
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
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
        <Select value={prefixFilter} onValueChange={setPrefixFilter}>
          <SelectTrigger className="h-9 w-[130px]" aria-label={t("pipeline.prefix")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pipeline.prefix")}: {t("common.all")}</SelectItem>
            {["010", "011", "012", "015"].map((p) => (
              <SelectItem key={p} value={p} className="tnum">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => openLead(l)}
                          aria-label={t("ops.openLead")}
                        >
                          {t("ops.openLead")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
      <LeadSheet />
    </div>
  );
}
