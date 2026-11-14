"use client";

/**
 * Campaigns module — management cards, full create/edit form and a
 * per-campaign performance dashboard. Starting a campaign auto-fills the
 * call queue (do-not-call contacts are always excluded).
 */

import { useMemo, useState } from "react";
import {
  Ban,
  CalendarDays,
  Clock,
  FileText,
  Headphones,
  Pencil,
  Play,
  Plus,
  Repeat,
  Square,
  Target,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { campaignStatusMeta, callStatusMeta, outcomeMeta } from "@/lib/status";
import type { Campaign, CampaignCallType, CampaignStatus } from "@/lib/types";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { ConfirmDialog } from "@/components/app/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";

const CALL_TYPES: CampaignCallType[] = ["outbound_sales", "customer_service", "followup", "appointments", "survey"];
const STATUSES: CampaignStatus[] = ["draft", "scheduled", "running", "paused", "completed"];

export function CampaignsView() {
  const { t, fmtDate } = useI18n();
  const campaigns = useDataStore((s) => s.campaigns);
  const contacts = useDataStore((s) => s.contacts);
  const calls = useDataStore((s) => s.calls);
  const store = useDataStore;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [details, setDetails] = useState<Campaign | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const statsFor = (c: Campaign) => {
    const cs = calls.filter((x) => x.campaignId === c.id);
    const answered = cs.filter((x) => x.status === "answered");
    const interested = answered.filter((x) => ["interested", "sale"].includes(x.outcome)).length;
    const success = answered.length ? Math.round((interested / answered.length) * 100) : 0;
    return {
      contacts: contacts.filter((x) => x.campaignId === c.id && x.status === "active").length,
      total: cs.length,
      answered: answered.length,
      noAnswer: cs.filter((x) => x.status !== "answered").length,
      interested,
      notInterested: answered.filter((x) => x.outcome === "not_interested").length,
      callbacks: answered.filter((x) => x.outcome === "callback").length,
      conversions: answered.filter((x) => x.outcome === "transferred").length,
      success,
      recent: cs.slice(0, 5),
    };
  };

  const startCampaign = (c: Campaign) => {
    store.getState().updateCampaign(c.id, { status: "running" });
    // Auto-fill the queue with assignable contacts (max 10, DND excluded).
    const existing = new Set(store.getState().queue.map((q) => q.contactId));
    const targets = store.getState().contacts
      .filter((x) => x.campaignId === c.id && x.status === "active" && !existing.has(x.id))
      .slice(0, 10);
    targets.forEach((x) =>
      store.getState().addQueueItem({
        contactId: x.id,
        name: x.name,
        phone: x.phone,
        campaignId: c.id,
        priority: "normal",
      })
    );
    toast.success(`${c.name} — ${t("campaigns.start")}`);
    if (targets.length > 0) toast.info(`${targets.length} → ${t("nav.queue")}`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("campaigns.title")}
        desc={t("campaigns.desc")}
        actions={
          <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="size-4" />
            {t("campaigns.add")}
          </Button>
        }
      />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Headphones}
          title={t("campaigns.noCampaigns")}
          desc={t("campaigns.noCampaignsDesc")}
          action={
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="size-4" /> {t("campaigns.add")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {campaigns.map((c) => {
            const st = statsFor(c);
            return (
              <Card key={c.id} className="flex flex-col border-border/70">
                <CardContent className="flex flex-1 flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold">{c.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{c.purpose}</p>
                    </div>
                    <StatusBadge tone={campaignStatusMeta[c.status].tone} label={t(campaignStatusMeta[c.status].key)} live={c.status === "running"} />
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><Target className="size-3.5" />{t(`callType.${c.callType}`)}</span>
                    <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3.5" />{fmtDate(c.startDate)}</span>
                    <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /><span className="tnum">{c.timeFrom} – {c.timeTo}</span></span>
                    <span className="inline-flex items-center gap-1.5"><Repeat className="size-3.5" />{c.retryAttempts} × ({c.retryDelayHours}h)</span>
                    <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" />{st.contacts}</span>
                  </div>

                  {/* Mini stats */}
                  <div className="grid grid-cols-4 gap-2 rounded-xl border border-border/60 bg-background/40 p-3 text-center">
                    <MiniStat label={t("campaigns.callsCompleted")} value={st.total} />
                    <MiniStat label={t("campaigns.answered")} value={st.answered} />
                    <MiniStat label={t("campaigns.interested")} value={st.interested} tone="text-emerald-500" />
                    <MiniStat label={t("campaigns.successRate")} value={`${st.success}%`} tone="text-primary" />
                  </div>

                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDetails(c)}>
                      <FileText className="size-3.5" />
                      {t("campaigns.details")}
                    </Button>
                    {c.status === "running" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => { store.getState().updateCampaign(c.id, { status: "paused" }); toast.info(t("dash.pausedHint")); }}
                      >
                        <Square className="size-3.5" /> {t("campaigns.pause")}
                      </Button>
                    ) : (
                      <Button size="sm" className="h-8 text-xs" onClick={() => startCampaign(c)}>
                        <Play className="size-3.5" /> {t("campaigns.start")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ms-auto size-8"
                      aria-label={t("common.edit")}
                      onClick={() => { setEditing(c); setDialogOpen(true); }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      aria-label={t("common.delete")}
                      onClick={() => setConfirmDelete(c.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CampaignDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campaign={editing}
      />

      <CampaignDetailsDialog campaign={details} onOpenChange={(o) => { if (!o) setDetails(null); }} />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
        title={t("common.delete")}
        desc={t("common.confirmDeleteDesc")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (confirmDelete) store.getState().deleteCampaign(confirmDelete);
          toast.success(t("common.deleteToast"));
        }}
      />
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className={`text-base font-semibold tnum ${tone ?? ""}`}>{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

/* ------------------------------ create / edit ------------------------------ */

function CampaignDialog({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaign: Campaign | null;
}) {
  const { t } = useI18n();
  const store = useDataStore;
  const kb = useDataStore((s) => s.kb);
  const contacts = useDataStore((s) => s.contacts);

  const [form, setForm] = useState<Campaign>(() => campaign ?? blank());
  const [key, setKey] = useState(0);
  const [contactSearch, setContactSearch] = useState("");

  // Re-seed the form whenever the dialog opens for a different campaign.
  const formKey = `${open}-${campaign?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    setForm(campaign ?? blank());
    setKey((k) => k + 1);
  }

  const set = <K extends keyof Campaign>(k: K, v: Campaign[K]) => setForm((f) => ({ ...f, [k]: v }));

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    return contacts.filter(
      (c) => c.status === "active" && (!q || `${c.name} ${c.phone} ${c.business}`.toLowerCase().includes(q))
    );
  }, [contacts, contactSearch]);

  const toggleContact = (id: string, on: boolean) => {
    store.getState().updateContact(id, { campaignId: on ? form.id || "pending" : null });
  };

  const save = () => {
    if (!form.name.trim()) {
      toast.error(t("common.required"));
      return;
    }
    const payload: Partial<Campaign> = { ...form };
    if (campaign) {
      store.getState().updateCampaign(campaign.id, payload);
      toast.success(t("common.savedToast"));
    } else {
      const created = store.getState().addCampaign(payload);
      // Attach currently checked contacts (they were marked "pending").
      store.getState().contacts
        .filter((c) => c.campaignId === "pending")
        .forEach((c) => store.getState().updateContact(c.id, { campaignId: created.id }));
      toast.success(t("common.createdToast"));
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-2xl sc-scroll">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base">
            {campaign ? t("common.edit") : t("campaigns.add")}
          </DialogTitle>
        </DialogHeader>
        <div key={key} className="grid gap-4 px-5 py-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("campaigns.name")}</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("campaigns.purpose")}</Label>
            <Textarea rows={2} value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("campaigns.callType")}</Label>
            <Select value={form.callType} onValueChange={(v) => set("callType", v as CampaignCallType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CALL_TYPES.map((x) => (
                  <SelectItem key={x} value={x}>{t(`callType.${x}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("campaigns.campaignStatus")}</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v as CampaignStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((x) => (
                  <SelectItem key={x} value={x}>{t(campaignStatusMeta[x].key)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("campaigns.startDate")}</Label>
            <Input
              type="date"
              value={form.startDate ? form.startDate.slice(0, 10) : ""}
              onChange={(e) => set("startDate", new Date(e.target.value).toISOString())}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("campaigns.allowedTimes")}</Label>
            <div className="flex items-center gap-2" dir="ltr">
              <Input type="time" value={form.timeFrom} onChange={(e) => set("timeFrom", e.target.value)} className="tnum" />
              <span className="text-muted-foreground">–</span>
              <Input type="time" value={form.timeTo} onChange={(e) => set("timeTo", e.target.value)} className="tnum" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("campaigns.maxCallsPerDay")}</Label>
            <Input type="number" min={1} className="tnum" value={form.maxCallsPerDay}
              onChange={(e) => set("maxCallsPerDay", Number(e.target.value) || 1)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("campaigns.retryAttempts")}</Label>
              <Input type="number" min={0} className="tnum" value={form.retryAttempts}
                onChange={(e) => set("retryAttempts", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("campaigns.retryDelay")}</Label>
              <Input type="number" min={0} className="tnum" value={form.retryDelayHours}
                onChange={(e) => set("retryDelayHours", Number(e.target.value) || 0)} />
            </div>
          </div>

          {/* Knowledge base */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t("campaigns.knowledge")}</Label>
            <div className="grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-2">
              {kb.map((k) => (
                <label key={k.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent">
                  <Checkbox
                    checked={form.knowledgeIds.includes(k.id)}
                    onCheckedChange={(v) =>
                      set("knowledgeIds", v ? [...form.knowledgeIds, k.id] : form.knowledgeIds.filter((x) => x !== k.id))
                    }
                  />
                  <span className="truncate">{k.title}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Target contacts */}
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>{t("campaigns.targetContacts")}</Label>
              <span className="inline-flex items-center gap-1 text-[11px] text-rose-500">
                <Ban className="size-3" />
                {t("campaigns.dndExcluded")}
              </span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder={t("common.search")}
                className="h-9 ps-9"
              />
            </div>
            <ScrollArea className="h-44 rounded-xl border border-border/70">
              <div className="p-2">
                {filteredContacts.map((c) => {
                  const checked = campaign ? c.campaignId === form.id : c.campaignId === "pending";
                  return (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent">
                      <Checkbox checked={checked} onCheckedChange={(v) => toggleContact(c.id, v === true)} />
                      <span className="min-w-0 flex-1 truncate">
                        {c.name}
                        <span className="text-muted-foreground"> — {c.business}</span>
                      </span>
                      <span dir="ltr" className="text-[11px] text-muted-foreground tnum">{c.phone}</span>
                    </label>
                  );
                })}
                {filteredContacts.length === 0 ? (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t("common.noResults")}</p>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <div className="flex items-center justify-end gap-2 sm:col-span-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function blank(): Campaign & { contactIds?: string[] } {
  return {
    id: "",
    name: "",
    purpose: "",
    callType: "outbound_sales",
    startDate: new Date().toISOString(),
    timeFrom: "10:00",
    timeTo: "18:00",
    maxCallsPerDay: 100,
    retryAttempts: 3,
    retryDelayHours: 4,
    agentId: "agent_1",
    knowledgeIds: [],
    status: "draft",
    createdAt: new Date().toISOString(),
    contactIds: [],
  };
}

/* -------------------------------- details ---------------------------------- */

function CampaignDetailsDialog({
  campaign,
  onOpenChange,
}: {
  campaign: Campaign | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, fmtDuration, fmtDateTime } = useI18n();
  const calls = useDataStore((s) => s.calls);
  if (!campaign) return null;

  const cs = calls.filter((x) => x.campaignId === campaign.id);
  const answered = cs.filter((x) => x.status === "answered");
  const interested = answered.filter((x) => ["interested", "sale"].includes(x.outcome)).length;
  const success = answered.length ? Math.round((interested / answered.length) * 100) : 0;

  const outcomes = Object.keys(outcomeMeta).map((k) => ({
    key: k,
    count: answered.filter((x) => x.outcome === k).length,
  }));
  const maxOutcome = Math.max(1, ...outcomes.map((o) => o.count));

  return (
    <Dialog open={!!campaign} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-xl sc-scroll">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="flex items-center justify-between gap-3 text-base">
            <span className="truncate">{campaign.name}</span>
            <StatusBadge tone={campaignStatusMeta[campaign.status].tone} label={t(campaignStatusMeta[campaign.status].key)} />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-5 py-5">
          <p className="text-sm leading-relaxed text-muted-foreground">{campaign.purpose}</p>

          <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-4">
            <MiniStat label={t("campaigns.callsCompleted")} value={cs.length} />
            <MiniStat label={t("campaigns.answered")} value={answered.length} />
            <MiniStat label={t("campaigns.noAnswer")} value={cs.length - answered.length} />
            <MiniStat label={t("campaigns.interested")} value={interested} tone="text-emerald-500" />
            <MiniStat label={t("campaigns.notInterested")} value={outcomes.find((o) => o.key === "not_interested")?.count ?? 0} tone="text-rose-500" />
            <MiniStat label={t("campaigns.callbacks")} value={outcomes.find((o) => o.key === "callback")?.count ?? 0} tone="text-amber-500" />
            <MiniStat label={t("campaigns.conversions")} value={outcomes.find((o) => o.key === "transferred")?.count ?? 0} tone="text-violet-500" />
            <MiniStat label={t("campaigns.successRate")} value={`${success}%`} tone="text-primary" />
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{t("campaigns.outcomesBreakdown")}</p>
            <div className="space-y-2">
              {outcomes.filter((o) => o.count > 0).map((o) => (
                <div key={o.key} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{t(outcomeMeta[o.key].key)}</span>
                  <Progress value={(o.count / maxOutcome) * 100} className="h-2 flex-1" />
                  <span className="w-8 text-end text-xs tnum">{o.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">{t("campaigns.recentCalls")}</p>
            <div className="divide-y divide-border/60 rounded-xl border border-border/70">
              {cs.slice(0, 6).map((c) => {
                const resMeta = c.status === "answered" ? outcomeMeta[c.outcome] : callStatusMeta[c.status];
                return (
                  <div key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{c.contactName}</span>
                      <span className="block text-[11px] text-muted-foreground tnum">{fmtDateTime(c.startedAt)} · {fmtDuration(c.durationSec)}</span>
                    </span>
                    <StatusBadge tone={resMeta.tone} label={t(resMeta.key)} />
                  </div>
                );
              })}
              {cs.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">{t("common.noData")}</p>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
