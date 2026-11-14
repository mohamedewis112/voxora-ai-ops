"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CheckCheck, Clock3, ExternalLink, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { useOps, opsPost, notifyOpsChanged } from "@/hooks/use-ops";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { useUiStore } from "@/stores/ui-store";
import { PageHeader } from "@/components/app/shared/page-header";
import { EmptyState } from "@/components/app/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SalesFollowup {
  id: string;
  leadId: string;
  scheduledAt: string;
  reason: string;
  status: string;
  priority: number;
  createdAt: string;
  completedAt: string | null;
  businessName: string;
  customerName: string;
  phone: string;
  prefix: string;
}

function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function SalesFollowupsView() {
  const { data, loading, error, refresh } = useOps<SalesFollowup[]>("followups", { status: "all" }, { pollMs: 30000 });
  const selectLead = useOpsUiStore((s) => s.selectLead);
  const setView = useUiStore((s) => s.setView);
  const [busyId, setBusyId] = useState<string | null>(null);

  const buckets = useMemo(() => {
    const now = Date.now();
    const start = dayStart(new Date());
    const end = start + 86_400_000;
    const active = (data ?? []).filter((f) => f.status === "scheduled");
    return {
      overdue: active.filter((f) => new Date(f.scheduledAt).getTime() < start),
      today: active.filter((f) => {
        const t = new Date(f.scheduledAt).getTime();
        return t >= start && t < end;
      }),
      upcoming: active.filter((f) => new Date(f.scheduledAt).getTime() >= end),
      doneToday: (data ?? []).filter((f) => f.status === "done" && f.completedAt && new Date(f.completedAt).getTime() >= start && new Date(f.completedAt).getTime() <= now),
    };
  }, [data]);

  const openLead = (leadId: string) => {
    selectLead(leadId);
    setView("sales");
  };

  const update = async (f: SalesFollowup, status: "done" | "snoozed" | "canceled") => {
    setBusyId(f.id);
    try {
      await opsPost(`leads/${f.leadId}/followup-status`, { followupId: f.id, status });
      notifyOpsChanged();
      refresh();
      toast.success(status === "done" ? "تم إنهاء المتابعة" : status === "snoozed" ? "تم تأجيل المتابعة ليوم" : "تم إلغاء المتابعة");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر تحديث المتابعة");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="المتابعات"
        desc="كل المواعيد التي سجلتيها على عملائك — بدون أي مكالمات آلية."
        actions={
          <Button variant="outline" size="sm" onClick={() => refresh()}>
            <RefreshCw className="size-4" /> تحديث
          </Button>
        }
      />

      {error ? (
        <EmptyState icon={CalendarClock} title="تعذر تحميل المتابعات" desc={error} />
      ) : loading && !data ? (
        <p className="py-10 text-center text-sm text-muted-foreground">جارٍ تحميل المتابعات…</p>
      ) : (
        <Tabs defaultValue="today" className="gap-4">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="today">اليوم <Count n={buckets.today.length} /></TabsTrigger>
            <TabsTrigger value="overdue">متأخرة <Count n={buckets.overdue.length} danger /></TabsTrigger>
            <TabsTrigger value="upcoming">قادمة <Count n={buckets.upcoming.length} /></TabsTrigger>
            <TabsTrigger value="done">تم اليوم <Count n={buckets.doneToday.length} /></TabsTrigger>
          </TabsList>

          <FollowupTab value="today" items={buckets.today} busyId={busyId} openLead={openLead} update={update} />
          <FollowupTab value="overdue" items={buckets.overdue} busyId={busyId} openLead={openLead} update={update} />
          <FollowupTab value="upcoming" items={buckets.upcoming} busyId={busyId} openLead={openLead} update={update} />
          <FollowupTab value="done" items={buckets.doneToday} busyId={busyId} openLead={openLead} update={update} readonly />
        </Tabs>
      )}
    </div>
  );
}

function Count({ n, danger = false }: { n: number; danger?: boolean }) {
  return (
    <span className={`ms-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${danger && n ? "bg-rose-500/15 text-rose-500" : "bg-muted text-muted-foreground"}`}>
      {n}
    </span>
  );
}

function FollowupTab({
  value,
  items,
  busyId,
  openLead,
  update,
  readonly = false,
}: {
  value: string;
  items: SalesFollowup[];
  busyId: string | null;
  openLead: (id: string) => void;
  update: (f: SalesFollowup, s: "done" | "snoozed" | "canceled") => void;
  readonly?: boolean;
}) {
  return (
    <TabsContent value={value} className="mt-0">
      {items.length === 0 ? (
        <EmptyState icon={CalendarClock} title="لا توجد متابعات هنا" />
      ) : (
        <div className="space-y-2.5">
          {items.map((f) => (
            <div key={f.id} className="rounded-xl border border-border/70 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{f.businessName || f.customerName || f.phone}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span dir="ltr" className="font-mono">{f.phone}</span>
                    {f.prefix ? <Badge variant="outline">{f.prefix}</Badge> : null}
                    <span>{f.reason || "متابعة"}</span>
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-foreground">
                  {new Date(f.scheduledAt).toLocaleString("ar-EG")}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openLead(f.leadId)}>
                  <ExternalLink className="size-3.5" /> فتح العميل
                </Button>
                {!readonly ? (
                  <>
                    <Button size="sm" onClick={() => void update(f, "done")} disabled={busyId === f.id}>
                      <CheckCheck className="size-3.5" /> تم
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void update(f, "snoozed")} disabled={busyId === f.id}>
                      <Clock3 className="size-3.5" /> تأجيل يوم
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void update(f, "canceled")} disabled={busyId === f.id}>
                      <X className="size-3.5" /> إلغاء
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </TabsContent>
  );
}
