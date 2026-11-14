"use client";

/**
 * Follow-ups — scheduled callbacks with customers, split into today /
 * overdue / upcoming. Each pending item can be called right away (blocked
 * while the agent is on a live call), marked done, snoozed by one day, or
 * canceled (with confirmation). New follow-ups are created via a dialog.
 */

import { useMemo, useState } from "react";
import { CalendarClock, CheckCheck, Clock, PhoneCall, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { useAgentStore } from "@/stores/agent-store";
import { getTelephony } from "@/services/telephony";
import { followUpStatusMeta } from "@/lib/status";
import type { FollowUp } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { EmptyState } from "@/components/app/shared/empty-state";
import { ConfirmDialog } from "@/components/app/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAY_MS = 86_400_000;

/** Agent statuses during which new calls cannot be started. */
const ACTIVE_CALL_STATUSES = ["calling", "connected", "speaking", "listening", "processing"];

export function FollowUpsView() {
  const { t } = useI18n();
  const followups = useDataStore((s) => s.followups);
  const campaigns = useDataStore((s) => s.campaigns);
  const store = useDataStore;
  const agentStatus = useAgentStore((s) => s.status);
  const currentCall = useAgentStore((s) => s.currentCall);

  const [addOpen, setAddOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);

  const callBlocked = currentCall !== null || ACTIVE_CALL_STATUSES.includes(agentStatus);

  const pending = useMemo(() => followups.filter((f) => f.status === "pending"), [followups]);

  const { overdue, today, upcoming } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const end = start + DAY_MS;
    const buckets = {
      overdue: [] as FollowUp[],
      today: [] as FollowUp[],
      upcoming: [] as FollowUp[],
    };
    for (const f of pending) {
      const due = new Date(f.dueAt).getTime();
      if (due < start) buckets.overdue.push(f);
      else if (due < end) buckets.today.push(f);
      else buckets.upcoming.push(f);
    }
    const byDue = (a: FollowUp, b: FollowUp) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    buckets.overdue.sort(byDue);
    buckets.today.sort(byDue);
    buckets.upcoming.sort(byDue);
    return buckets;
  }, [pending]);

  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name ?? "—";

  const callNow = async (f: FollowUp) => {
    try {
      await getTelephony().startCall({
        id: f.contactId,
        name: f.name,
        phone: f.phone,
        campaignId: f.campaignId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const markDone = (f: FollowUp) => {
    store.getState().updateFollowUp(f.id, { status: "done" });
    toast.success(t("follow.doneToast"));
  };

  const snooze = (f: FollowUp) => {
    store
      .getState()
      .updateFollowUp(f.id, { dueAt: new Date(new Date(f.dueAt).getTime() + DAY_MS).toISOString() });
    toast.success(t("follow.overdueToast"));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("follow.title")}
        desc={t("follow.desc")}
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" />
            {t("follow.add")}
          </Button>
        }
      />

      <Tabs defaultValue="today" className="gap-4">
        <TabsList>
          <TabsTrigger value="today">
            {t("follow.today")}
            <CountPill n={today.length} />
          </TabsTrigger>
          <TabsTrigger value="overdue">
            {t("follow.overdue")}
            <CountPill n={overdue.length} danger />
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            {t("follow.upcoming")}
            <CountPill n={upcoming.length} />
          </TabsTrigger>
        </TabsList>

        <FollowUpsTab
          value="today"
          items={today}
          campaignName={campaignName}
          callBlocked={callBlocked}
          onCall={callNow}
          onDone={markDone}
          onSnooze={snooze}
          onCancel={(f) => setConfirmCancel(f.id)}
        />
        <FollowUpsTab
          value="overdue"
          items={overdue}
          campaignName={campaignName}
          callBlocked={callBlocked}
          onCall={callNow}
          onDone={markDone}
          onSnooze={snooze}
          onCancel={(f) => setConfirmCancel(f.id)}
        />
        <FollowUpsTab
          value="upcoming"
          items={upcoming}
          campaignName={campaignName}
          callBlocked={callBlocked}
          onCall={callNow}
          onDone={markDone}
          onSnooze={snooze}
          onCancel={(f) => setConfirmCancel(f.id)}
        />
      </Tabs>

      <AddFollowUpDialog open={addOpen} onOpenChange={setAddOpen} />

      <ConfirmDialog
        open={!!confirmCancel}
        onOpenChange={(o) => {
          if (!o) setConfirmCancel(null);
        }}
        title={t("follow.cancel")}
        desc={t("common.confirmDeleteDesc")}
        confirmLabel={t("common.confirm")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          if (confirmCancel) store.getState().updateFollowUp(confirmCancel, { status: "canceled" });
          toast.success(t("common.deleteToast"));
        }}
      />
    </div>
  );
}

/* ----------------------------------- Pieces ------------------------------------ */

function CountPill({ n, danger = false }: { n: number; danger?: boolean }) {
  return (
    <span
      className={cn(
        "ms-1 inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tnum",
        danger && n > 0
          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      {n}
    </span>
  );
}

function FollowUpsTab({
  value,
  items,
  campaignName,
  callBlocked,
  onCall,
  onDone,
  onSnooze,
  onCancel,
}: {
  value: string;
  items: FollowUp[];
  campaignName: (id: string | null) => string;
  callBlocked: boolean;
  onCall: (f: FollowUp) => void;
  onDone: (f: FollowUp) => void;
  onSnooze: (f: FollowUp) => void;
  onCancel: (f: FollowUp) => void;
}) {
  const { t } = useI18n();
  return (
    <TabsContent value={value} className="mt-0">
      {items.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t("follow.noFollowups")} />
      ) : (
        <div className="space-y-2.5">
          {items.map((f) => (
            <FollowUpRow
              key={f.id}
              fu={f}
              campaignName={campaignName(f.campaignId)}
              callBlocked={callBlocked}
              onCall={onCall}
              onDone={onDone}
              onSnooze={onSnooze}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </TabsContent>
  );
}

function FollowUpRow({
  fu,
  campaignName,
  callBlocked,
  onCall,
  onDone,
  onSnooze,
  onCancel,
}: {
  fu: FollowUp;
  campaignName: string;
  callBlocked: boolean;
  onCall: (f: FollowUp) => void;
  onDone: (f: FollowUp) => void;
  onSnooze: (f: FollowUp) => void;
  onCancel: (f: FollowUp) => void;
}) {
  const { t, fmtDateTime } = useI18n();
  const meta = followUpStatusMeta[fu.status];
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-semibold">{fu.name}</p>
          <p dir="ltr" className="text-xs text-muted-foreground tnum">
            {fu.phone}
          </p>
          {fu.reason ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{fu.reason}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
          <StatusBadge tone={meta.tone} label={t(meta.key)} />
          <span className="text-xs text-muted-foreground tnum">{fmtDateTime(fu.dueAt)}</span>
          <span className="truncate text-[11px] text-muted-foreground">{campaignName}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={() => onDone(fu)}>
          <CheckCheck className="size-3.5" />
          {t("follow.markDone")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-destructive hover:text-destructive"
          onClick={() => onCancel(fu)}
        >
          <X className="size-3.5" />
          {t("follow.cancel")}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onSnooze(fu)}>
          <Clock className="size-3.5" />
          {t("common.snooze")}
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={callBlocked}
          onClick={() => void onCall(fu)}
        >
          <PhoneCall className="size-3.5" />
          {t("common.callNow")}
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------- Add dialog ---------------------------------- */

interface AddFollowUpForm {
  contactId: string;
  reason: string;
  dueAt: string;
}

function blankFollowUpForm(): AddFollowUpForm {
  return { contactId: "", reason: "", dueAt: "" };
}

function AddFollowUpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useI18n();
  const store = useDataStore;
  const contacts = useDataStore((s) => s.contacts);

  const [form, setForm] = useState<AddFollowUpForm>(blankFollowUpForm);
  const [key, setKey] = useState(0);

  // Re-seed the form whenever the dialog opens (same pattern as campaigns-view).
  const formKey = String(open);
  const [lastKey, setLastKey] = useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    setForm(blankFollowUpForm());
    setKey((k) => k + 1);
  }

  const activeContacts = useMemo(
    () => contacts.filter((c) => c.status === "active"),
    [contacts]
  );

  const save = () => {
    const contact = store
      .getState()
      .contacts.find((c) => c.id === form.contactId && c.status === "active");
    if (!contact || !form.dueAt) {
      toast.error(t("common.required"));
      return;
    }
    store.getState().addFollowUp({
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone,
      reason: form.reason.trim(),
      dueAt: new Date(form.dueAt).toISOString(),
      campaignId: contact.campaignId,
    });
    toast.success(t("common.createdToast"));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-md sc-scroll">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base">{t("follow.add")}</DialogTitle>
        </DialogHeader>
        <div key={key} className="grid gap-4 px-5 py-5">
          <div className="space-y-1.5">
            <Label>{t("follow.contact")}</Label>
            <Select
              value={form.contactId}
              onValueChange={(v) => setForm((f) => ({ ...f, contactId: v }))}
            >
              <SelectTrigger aria-label={t("follow.contact")}>
                <SelectValue placeholder={t("follow.selectContact")} />
              </SelectTrigger>
              <SelectContent>
                {activeContacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.business ? ` — ${c.business}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("follow.reason")}</Label>
            <Input
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder={t("common.optional")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("follow.dueAt")}</Label>
            <Input
              type="datetime-local"
              className="tnum"
              value={form.dueAt}
              onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={save}>{t("common.save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
