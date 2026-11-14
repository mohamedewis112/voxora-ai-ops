"use client";

import { Activity, CalendarClock, Link2, RefreshCcw, Target, UsersRound, type LucideIcon } from "lucide-react";
import { useOps } from "@/hooks/use-ops";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface AgentSummary {
  id: string;
  name: string;
  code: string;
  total: number;
  interested: number;
  linked: number;
  callbacks: number;
  prefix010: number;
  prefix011: number;
  prefix012: number;
  prefix015: number;
  prefix02: number;
}
interface ManagerOverview {
  totalLeads: number;
  linked: number;
  interested: number;
  callbacks: number;
  whatsapp: number;
  invalid: number;
  followupsToday: number;
  overdueFollowups: number;
  activityToday: number;
  agents: AgentSummary[];
  prefixes: Record<string, number>;
}
interface ActivityRow {
  id: string;
  leadId: string | null;
  type: string;
  actorName: string;
  title: string;
  createdAt: string;
  businessName: string;
  phone: string;
}

export function ManagerDashboardView() {
  const overview = useOps<ManagerOverview>("overview", undefined, { pollMs: 20000 });
  const activity = useOps<ActivityRow[]>("activity", undefined, { pollMs: 20000 });

  const cards: Array<[string, number, LucideIcon]> = overview.data ? [
    ["إجمالي العملاء", overview.data.totalLeads, UsersRound],
    ["تم الربط", overview.data.linked, Link2],
    ["مهتم", overview.data.interested, Target],
    ["متابعات اليوم", overview.data.followupsToday, CalendarClock],
    ["متابعات متأخرة", overview.data.overdueFollowups, CalendarClock],
    ["نشاطات اليوم", overview.data.activityToday, Activity],
  ] : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="لوحة المدير"
        desc="متابعة لحظية لشغل فريق المبيعات بالكامل."
        actions={
          <Button variant="outline" size="sm" onClick={() => { overview.refresh(); activity.refresh(); }}>
            <RefreshCcw className="size-4" /> تحديث
          </Button>
        }
      />

      {overview.loading && !overview.data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : overview.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([label, value, Icon]) => (
              <Card key={label}>
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-2xl font-bold tnum">{value}</p>
                  </div>
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {overview.data.agents.map((a) => (
              <Card key={a.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-3 text-base">
                    <span>{a.name}</span>
                    <Badge variant="secondary">{a.code === "sales-010" ? "أغلبها 010" : "أغلبها 011"}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">العملاء</p><p className="font-bold tnum">{a.total}</p></div>
                    <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">مهتم</p><p className="font-bold tnum">{a.interested}</p></div>
                    <div className="rounded-lg bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">تم الربط</p><p className="font-bold tnum">{a.linked}</p></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">010: {a.prefix010}</Badge>
                    <Badge variant="outline">011: {a.prefix011}</Badge>
                    <Badge variant="outline">012: {a.prefix012}</Badge>
                    <Badge variant="outline">015: {a.prefix015}</Badge>
                    <Badge variant="outline">02: {a.prefix02}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card><CardContent className="p-6 text-sm text-destructive">تعذر تحميل لوحة المدير.</CardContent></Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">آخر ما حدث</CardTitle>
        </CardHeader>
        <CardContent>
          {activity.loading && !activity.data ? (
            <div className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-12" />)}</div>
          ) : (activity.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">لا توجد نشاطات مسجلة بعد.</p>
          ) : (
            <div className="space-y-2">
              {(activity.data ?? []).slice(0, 20).map((row) => (
                <div key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/70 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {row.actorName || "النظام"} · {row.businessName || row.phone || "عميل"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString("ar-EG")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
