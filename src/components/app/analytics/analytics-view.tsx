"use client";

/**
 * Analytics — period-filtered KPIs, recharts visualizations, a CSS lead
 * funnel, top objections and the AI agent performance table. Every number is
 * computed client-side from the data store within the selected date range.
 */

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  BarChart3,
  Bot,
  CheckCheck,
  PhoneCall,
  PhoneForwarded,
  Timer,
  TrendingUp,
  UserCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { leadStageMeta, outcomeMeta } from "@/lib/status";
import type { Tone } from "@/lib/status";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatCard } from "@/components/app/shared/stat-card";
import { EmptyState } from "@/components/app/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CallOutcome, LeadStage } from "@/lib/types";

/* --------------------------------- consts --------------------------------- */

const DAY = 86400_000;

type RangePreset = "today" | "yesterday" | "last7" | "last30" | "custom";

const RANGE_PRESETS: Exclude<RangePreset, "custom">[] = ["today", "yesterday", "last7", "last30"];

const RANGE_LABEL: Record<Exclude<RangePreset, "custom">, string> = {
  today: "common.today",
  yesterday: "common.yesterday",
  last7: "common.last7",
  last30: "common.last30",
};

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

const SUCCESS_OUTCOMES: CallOutcome[] = ["interested", "sale", "transferred"];

const FUNNEL_STAGES: LeadStage[] = [
  "new",
  "contacted",
  "interested",
  "followup",
  "ready_to_close",
  "transferred",
  "won",
];

/** Domain tone → chart variable used as bar fill (color-mixed). */
const TONE_COLOR: Record<Tone, string> = {
  success: "var(--chart-1)",
  warning: "var(--chart-2)",
  danger: "var(--chart-4)",
  info: "var(--chart-1)",
  neutral: "var(--muted-foreground)",
  violet: "var(--chart-3)",
  sky: "var(--chart-5)",
};

/** Domain tone → text color (same palette as StatCard icons). */
const TONE_TEXT: Record<Tone, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
  info: "text-teal-600 dark:text-teal-400",
  neutral: "text-zinc-600 dark:text-zinc-400",
  violet: "text-violet-600 dark:text-violet-400",
  sky: "text-cyan-600 dark:text-cyan-400",
};

const TOOLTIP_STYLE: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

/* --------------------------------- helpers -------------------------------- */

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "YYYY-MM-DD" from <input type="date"> → local midnight timestamp. */
function parseDateInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

function dayLabel(ms: number, lang: "ar" | "en"): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(ms);
}

/* ------------------------- module-scope sub-views -------------------------- */

function ChartCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="border-b border-border/60 py-3.5">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

/** One CSS bar row (funnel stages / objections). Width is percentage-based. */
function BarRow({
  label,
  count,
  pct,
  color,
  labelClassName,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
  labelClassName?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("w-32 shrink-0 truncate text-xs", labelClassName)} title={label}>
        {label}
      </span>
      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: `color-mix(in oklab, ${color} 75%, transparent)` }}
        />
      </div>
      <span className="w-8 shrink-0 text-end text-xs text-muted-foreground tnum">{count}</span>
    </div>
  );
}

/* ---------------------------------- view ---------------------------------- */

export function AnalyticsView() {
  const { t, lang, fmtDate, fmtDuration } = useI18n();
  const calls = useDataStore((s) => s.calls);
  const leads = useDataStore((s) => s.leads);
  const campaigns = useDataStore((s) => s.campaigns);
  const agentName = useDataStore((s) => s.agent.name);

  const [preset, setPreset] = useState<RangePreset>("last7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);

  /* Date range [from, to) in ms — drives every computation below. */
  const range = useMemo<{ from: number; to: number }>(() => {
    const now = Date.now();
    const todayStart = startOfDay(now);
    switch (preset) {
      case "today":
        return { from: todayStart, to: todayStart + DAY };
      case "yesterday":
        return { from: todayStart - DAY, to: todayStart };
      case "last30":
        return { from: todayStart - 29 * DAY, to: todayStart + DAY };
      case "custom": {
        const f = applied ? parseDateInput(applied.from) : null;
        const to = applied ? parseDateInput(applied.to) : null;
        if (f !== null && to !== null) {
          const [a, b] = f <= to ? [f, to] : [to, f];
          return { from: a, to: b + DAY };
        }
        return { from: todayStart - 6 * DAY, to: todayStart + DAY };
      }
      default:
        return { from: todayStart - 6 * DAY, to: todayStart + DAY };
    }
  }, [preset, applied]);

  const inRangeTs = (ts: number): boolean => ts >= range.from && ts < range.to;

  const rangeCalls = useMemo(
    () => calls.filter((c) => inRangeTs(new Date(c.startedAt).getTime())),
    [calls, range]
  );
  const answeredCalls = useMemo(() => rangeCalls.filter((c) => c.status === "answered"), [rangeCalls]);

  /* KPIs */
  const kpis = useMemo(() => {
    const total = rangeCalls.length;
    const answered = answeredCalls.length;
    const successful = answeredCalls.filter((c) => SUCCESS_OUTCOMES.includes(c.outcome)).length;
    const interested = rangeCalls.filter((c) => c.outcome === "interested" || c.outcome === "sale").length;
    const transfers = rangeCalls.filter((c) => c.outcome === "transferred").length;
    const durations = answeredCalls.filter((c) => c.durationSec > 0).map((c) => c.durationSec);
    const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    return {
      total,
      answerRate: total > 0 ? Math.round((answered / total) * 100) : 0,
      successRate: answered > 0 ? Math.round((successful / answered) * 100) : 0,
      interested,
      avgDur,
      transfers,
    };
  }, [rangeCalls, answeredCalls]);

  /* Calls per day across the selected range */
  const perDay = useMemo(() => {
    const days: { label: string; calls: number; answered: number }[] = [];
    for (let ts = startOfDay(range.from); ts < range.to; ts += DAY) {
      const dayCalls = rangeCalls.filter((c) => {
        const x = new Date(c.startedAt).getTime();
        return x >= ts && x < ts + DAY;
      });
      days.push({
        label: dayLabel(ts, lang),
        calls: dayCalls.length,
        answered: dayCalls.filter((c) => c.status === "answered").length,
      });
    }
    return days;
  }, [rangeCalls, range, lang]);

  /* Outcome distribution over answered calls (donut) */
  const outcomeData = useMemo(() => {
    const counts = new Map<CallOutcome, number>();
    for (const c of answeredCalls) counts.set(c.outcome, (counts.get(c.outcome) ?? 0) + 1);
    return Object.keys(outcomeMeta)
      .map((k) => ({ outcomeKey: k, name: k, value: counts.get(k as CallOutcome) ?? 0 }))
      .filter((d) => d.value > 0)
      .map((d, i) => ({ ...d, fill: CHART_COLORS[i % CHART_COLORS.length] }));
  }, [answeredCalls]);

  /* Calls per campaign */
  const campaignData = useMemo(
    () => campaigns.map((c) => ({ name: c.name, calls: rangeCalls.filter((x) => x.campaignId === c.id).length })),
    [campaigns, rangeCalls]
  );

  /* Calls by hour of day (0–23) */
  const byHour = useMemo(() => {
    const counts = new Array<number>(24).fill(0);
    for (const c of rangeCalls) counts[new Date(c.startedAt).getHours()] += 1;
    return counts.map((v, h) => ({ hour: String(h).padStart(2, "0"), calls: v }));
  }, [rangeCalls]);

  /* Lead funnel — leads are activity-based (lastCallAt) or never called (new). */
  const funnel = useMemo(() => {
    const active = leads.filter((l) => !l.lastCallAt || inRangeTs(new Date(l.lastCallAt).getTime()));
    const rows = FUNNEL_STAGES.map((stage) => ({
      stage,
      count: active.filter((l) => l.stage === stage).length,
    }));
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: (r.count / max) * 100 }));
  }, [leads, range]);

  /* Top objections among rejected calls */
  const objections = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of rangeCalls) {
      if (c.outcome === "not_interested" && c.objection) counts.set(c.objection, (counts.get(c.objection) ?? 0) + 1);
    }
    const rows = [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({ ...r, pct: (r.count / max) * 100 }));
  }, [rangeCalls]);

  const outcomeName = (key: string): string => {
    const meta = outcomeMeta[key];
    return meta ? t(meta.key) : key;
  };

  /* Empty state — nothing to analyze at all */
  if (calls.length === 0) {
    return (
      <div>
        <PageHeader title={t("analytics.title")} desc={t("analytics.desc")} />
        <EmptyState icon={BarChart3} title={t("common.noData")} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("analytics.title")}
        desc={t("analytics.desc")}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {RANGE_PRESETS.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={preset === p ? "default" : "outline"}
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => setPreset(p)}
              >
                {t(RANGE_LABEL[p])}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={preset === "custom" ? "default" : "outline"}
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => setPreset("custom")}
            >
              {t("common.custom")}
            </Button>
          </div>
        }
      />

      {/* Custom range inputs */}
      {preset === "custom" ? (
        <Card className="border-border/70">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-xs text-muted-foreground">{t("common.from")}</span>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 w-40"
              aria-label={t("common.from")}
            />
            <span className="text-xs text-muted-foreground">{t("common.to")}</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 w-40"
              aria-label={t("common.to")}
            />
            <Button
              type="button"
              size="sm"
              className="h-9"
              disabled={!customFrom || !customTo}
              onClick={() => setApplied({ from: customFrom, to: customTo })}
            >
              {t("common.apply")}
            </Button>
            {applied ? (
              <span className="text-xs text-muted-foreground tnum">
                {fmtDate(applied.from)} – {fmtDate(applied.to)}
              </span>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label={t("analytics.totalCalls")} value={kpis.total} icon={PhoneCall} tone="info" />
        <StatCard label={t("analytics.answerRate")} value={`${kpis.answerRate}%`} icon={CheckCheck} tone="success" />
        <StatCard label={t("analytics.successRate")} value={`${kpis.successRate}%`} icon={TrendingUp} tone="violet" />
        <StatCard label={t("analytics.interestedLeads")} value={kpis.interested} icon={UserCheck} tone="success" />
        <StatCard label={t("analytics.avgDuration")} value={fmtDuration(kpis.avgDur)} icon={Timer} tone="sky" />
        <StatCard label={t("analytics.transfers")} value={kpis.transfers} icon={PhoneForwarded} tone="warning" />
      </div>

      {/* Trend + outcomes donut */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title={t("analytics.callsPerDay")} className="lg:col-span-2">
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={perDay} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="analyticsArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "var(--foreground)" }} />
                <Area
                  type="monotone"
                  dataKey="calls"
                  name={t("analytics.callsCount")}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  fill="url(#analyticsArea)"
                />
                <Area
                  type="monotone"
                  dataKey="answered"
                  name={t("dash.answered")}
                  stroke="var(--chart-5)"
                  strokeWidth={2}
                  fillOpacity={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title={t("analytics.outcomes")}>
          <div className="relative h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: unknown, name: unknown) => [String(value), outcomeName(String(name))]}
                />
                <Legend
                  formatter={(value: unknown) => outcomeName(String(value))}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }}
                />
                <Pie
                  data={outcomeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  strokeWidth={2}
                  stroke="var(--card)"
                >
                  {outcomeData.map((d) => (
                    <Cell key={d.outcomeKey} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <span className="pointer-events-none absolute inset-0 flex -translate-y-3 items-center justify-center">
              <span className="text-2xl font-semibold tnum">{answeredCalls.length}</span>
            </span>
          </div>
        </ChartCard>
      </div>

      {/* Per campaign + per hour */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard title={t("analytics.callsByCampaign")}>
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={campaignData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="calls" name={t("analytics.callsCount")} fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title={t("analytics.callsByTime")}>
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byHour} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="calls" name={t("analytics.callsCount")} fill="var(--chart-2)" radius={[6, 6, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Funnel + objections */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={t("analytics.funnel")}>
          <div className="flex flex-col gap-2">
            {funnel.map((row) => {
              const meta = leadStageMeta[row.stage];
              return (
                <BarRow
                  key={row.stage}
                  label={t(meta.key)}
                  count={row.count}
                  pct={row.pct}
                  color={TONE_COLOR[meta.tone]}
                  labelClassName={TONE_TEXT[meta.tone]}
                />
              );
            })}
          </div>
        </ChartCard>

        <ChartCard title={t("analytics.objections")}>
          {objections.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">{t("common.noResults")}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {objections.map((row) => (
                <BarRow key={row.label} label={row.label} count={row.count} pct={row.pct} color="var(--chart-2)" />
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Agent performance */}
      <ChartCard title={t("analytics.agentPerf")}>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>{t("common.agent")}</TableHead>
              <TableHead className="text-end">{t("analytics.totalCalls")}</TableHead>
              <TableHead className="text-end">{t("analytics.answerRate")}</TableHead>
              <TableHead className="text-end">{t("analytics.avgDuration")}</TableHead>
              <TableHead className="text-end">{t("analytics.interestedCount")}</TableHead>
              <TableHead className="text-end">{t("analytics.transfers")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot className="size-3.5" aria-hidden="true" />
                  </span>
                  <span className="truncate text-[13px] font-medium">{agentName}</span>
                </div>
              </TableCell>
              <TableCell className="text-end text-[13px] tnum">{kpis.total}</TableCell>
              <TableCell className="text-end text-[13px] tnum">{kpis.answerRate}%</TableCell>
              <TableCell className="text-end text-[13px] tnum">{fmtDuration(kpis.avgDur)}</TableCell>
              <TableCell className="text-end text-[13px] tnum">{kpis.interested}</TableCell>
              <TableCell className="text-end text-[13px] tnum">{kpis.transfers}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </ChartCard>
    </div>
  );
}
