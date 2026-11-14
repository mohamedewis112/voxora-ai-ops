"use client";

/**
 * Executive dashboard — KPI cards, live agent panel, calls trend and
 * today's follow-ups. All numbers are computed client-side from the store.
 */

import { useMemo } from "react";
import {
  AlarmClockCheck,
  CalendarClock,
  CheckCheck,
  PhoneCall,
  PhoneMissed,
  Timer,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { useUiStore } from "@/stores/ui-store";
import { outcomeMeta, callStatusMeta } from "@/lib/status";
import { StatCard } from "@/components/app/shared/stat-card";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { PageHeader } from "@/components/app/shared/page-header";
import { AgentLivePanel } from "./agent-live-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Call } from "@/lib/types";

const DAY = 86400_000;

function isSameDay(iso: string, ref: number): boolean {
  const a = new Date(iso);
  const b = new Date(ref);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DashboardView() {
  const { t, fmtDuration, fmtDateTime } = useI18n();
  const setView = useUiStore((s) => s.setView);
  const calls = useDataStore((s) => s.calls);
  const followups = useDataStore((s) => s.followups);

  const stats = useMemo(() => {
    const now = Date.now();
    const inToday = calls.filter((c) => isSameDay(c.startedAt, now));
    const inYesterday = calls.filter((c) => isSameDay(c.startedAt, now - DAY));
    const pct = (cur: number, prev: number) => (prev === 0 ? undefined : Math.round(((cur - prev) / prev) * 100));
    const count = (arr: Call[], pred: (c: Call) => boolean) => arr.filter(pred).length;

    const answeredToday = count(inToday, (c) => c.status === "answered");
    const answeredYest = count(inYesterday, (c) => c.status === "answered");
    const missedToday = count(inToday, (c) => c.status !== "answered");
    const interestedToday = count(inToday, (c) => c.outcome === "interested" || c.outcome === "sale");
    const transferredToday = count(inToday, (c) => c.outcome === "transferred");
    const durations = inToday.filter((c) => c.status === "answered" && c.durationSec > 0).map((c) => c.durationSec);
    const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    const successRate = answeredToday ? Math.round((count(inToday, (c) => ["interested", "sale", "transferred"].includes(c.outcome)) / answeredToday) * 100) : 0;

    const dueFollowups = followups.filter(
      (f) => f.status === "pending" && new Date(f.dueAt).getTime() <= now + DAY
    ).length;

    return {
      total: inToday.length,
      totalDelta: pct(inToday.length, inYesterday.length),
      answered: answeredToday,
      answeredDelta: pct(answeredToday, answeredYest),
      missed: missedToday,
      interested: interestedToday,
      transferred: transferredToday,
      avgDur,
      successRate,
      dueFollowups,
    };
  }, [calls, followups]);

  const trend = useMemo(() => {
    const days: { key: string; label: string; calls: number; answered: number }[] = [];
    for (let d = 6; d >= 0; d--) {
      const ref = Date.now() - d * DAY;
      const dayCalls = calls.filter((c) => isSameDay(c.startedAt, ref));
      days.push({
        key: String(d),
        label: new Intl.DateTimeFormat("ar-EG-u-nu-latn", { day: "numeric", month: "short" }).format(ref),
        calls: dayCalls.length,
        answered: dayCalls.filter((c) => c.status === "answered").length,
      });
    }
    return days;
  }, [calls]);

  const recentCalls = useMemo(() => calls.slice(0, 7), [calls]);

  const todayFollowups = useMemo(
    () =>
      followups
        .filter((f) => f.status === "pending")
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
        .slice(0, 5),
    [followups]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("dash.title")}
        desc={t("dash.desc")}
        actions={
          <Button variant="outline" size="sm" onClick={() => setView("calls")}>
            <PhoneCall className="size-4" />
            {t("dash.viewAll")}
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t("dash.callsToday")} value={stats.total} icon={PhoneCall} tone="info" delta={stats.totalDelta} />
        <StatCard label={t("dash.answered")} value={stats.answered} icon={CheckCheck} tone="success" delta={stats.answeredDelta} />
        <StatCard label={t("dash.noAnswer")} value={stats.missed} icon={PhoneMissed} tone="warning" />
        <StatCard label={t("dash.interested")} value={stats.interested} icon={UserCheck} tone="success" />
        <StatCard label={t("dash.transferred")} value={stats.transferred} icon={TrendingUp} tone="violet" />
        <StatCard label={t("dash.followups")} value={stats.dueFollowups} icon={CalendarClock} tone="warning" />
        <StatCard label={t("dash.avgDuration")} value={fmtDuration(stats.avgDur)} icon={Timer} tone="sky" />
        <StatCard label={t("dash.successRate")} value={`${stats.successRate}%`} icon={AlarmClockCheck} tone="success" />
      </div>

      {/* Live agent + recent calls */}
      <div className="grid gap-4 lg:grid-cols-3">
        <AgentLivePanel className="lg:col-span-2" />
        <Card>
          <CardHeader className="flex-row items-center justify-between border-b border-border/60 py-3.5">
            <CardTitle className="text-sm">{t("dash.recentCalls")}</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView("calls")}>
              {t("dash.viewAll")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {recentCalls.map((c) => {
              const meta = c.status === "answered" ? outcomeMeta[c.outcome] : callStatusMeta[c.status];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setView("calls")}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{c.contactName}</span>
                    <span className="block truncate text-[11px] text-muted-foreground tnum" dir="ltr">
                      {c.phone} · {fmtDateTime(c.startedAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tnum">{fmtDuration(c.durationSec)}</span>
                  <StatusBadge tone={meta.tone} label={t(meta.key)} className="shrink-0" />
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Trend + followups */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="border-b border-border/60 py-3.5">
            <CardTitle className="text-sm">{t("dash.callsTrend")}</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-44" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: "var(--foreground)" }}
                  />
                  <Area type="monotone" dataKey="calls" name={t("analytics.totalCalls")} stroke="var(--chart-1)" strokeWidth={2} fill="url(#dashArea)" />
                  <Area type="monotone" dataKey="answered" name={t("dash.answered")} stroke="var(--chart-5)" strokeWidth={2} fillOpacity={0} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between border-b border-border/60 py-3.5">
            <CardTitle className="text-sm">{t("dash.todayFollowups")}</CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setView("followups")}>
              {t("dash.viewAll")}
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 p-2">
            {todayFollowups.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">{t("dash.noFollowupsToday")}</p>
            ) : (
              todayFollowups.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setView("followups")}
                  className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors hover:bg-accent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{f.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{f.reason}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tnum">{fmtDateTime(f.dueAt)}</span>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
