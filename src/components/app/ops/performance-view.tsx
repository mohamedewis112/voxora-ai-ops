"use client";

/**
 * Voxora AI — Ops · Performance view ("الأداء: المبيعات ضد AI").
 *
 * Fetches GET /api/ops/performance → PerformanceRowDTO[] (one row per sales
 * agent + one simulated AI row) and renders:
 *   1. KPI totals row (shared StatCard)
 *   2. Metric selector (Tabs) + recharts comparison bar chart
 *      — sales bars emerald, AI bar violet, via CSS-var chart palette
 *   3. Comparison table with best-per-column emerald highlighting and
 *      conversionRate shown as % + small Progress bar
 *   4. Computed Arabic summary insight + demo-mode chip
 * Includes loading skeleton, error+retry and empty states. Refreshes silently
 * every 30s and whenever cross-view ops mutations notify the shared bus.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  BarChart3,
  Bot,
  CheckCheck,
  FlaskConical,
  Link2,
  PhoneCall,
  RefreshCw,
  TriangleAlert,
  User,
  UserCheck,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n";
import type { PerformanceRowDTO } from "@/lib/ops-types";
import { onOpsChanged, useOps } from "@/hooks/use-ops";
import { PageHeader } from "@/components/app/shared/page-header";
import { StatCard } from "@/components/app/shared/stat-card";
import { EmptyState } from "@/components/app/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/* --------------------------------- consts --------------------------------- */

/** Chartable numeric metrics — conversionRate is rendered in the table only. */
type MetricKey = "calls" | "answered" | "interested" | "followups" | "linked";

const METRICS: { key: MetricKey; i18n: string }[] = [
  { key: "calls", i18n: "perf.calls" },
  { key: "answered", i18n: "perf.answered" },
  { key: "interested", i18n: "perf.interested" },
  { key: "followups", i18n: "perf.followups" },
  { key: "linked", i18n: "perf.linked" },
];

/** CSS-var chart palette aligned with the app tone map (chart-1 = emerald family, chart-3 = violet family). */
const SALES_FILL = "var(--chart-1)";
const AI_FILL = "var(--chart-3)";

const KIND_BADGE: Record<PerformanceRowDTO["kind"], string> = {
  sales: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  ai: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

const TOOLTIP_STYLE: CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
};

/* -------------------------------- helpers --------------------------------- */

function kindFill(kind: PerformanceRowDTO["kind"]): string {
  return kind === "sales" ? SALES_FILL : AI_FILL;
}

/** 0–100 percent with at most one decimal, e.g. 34 → "34%", 12.34 → "12.3%". */
function fmtPct(value: number): string {
  const r = Math.round(value * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}%`;
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Trim long Arabic agent names for XAxis ticks. */
function trimTick(value: string): string {
  return value.length > 14 ? `${value.slice(0, 13)}…` : value;
}

/** Numeric table-cell classes; the best value per column gets subtle emerald text. */
function metricCellCls(value: number, best: number | undefined): string {
  return cn(
    "text-end text-[13px] tnum",
    best !== undefined && best > 0 && value === best && "font-medium text-emerald-600 dark:text-emerald-400"
  );
}

/* ----------------------------- module sub-views ---------------------------- */

function ChartCard({
  title,
  actions,
  children,
  className,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader
        className={cn(
          "border-b border-border/60 py-3.5",
          actions && "flex flex-row flex-wrap items-center justify-between gap-3"
        )}
      >
        <CardTitle className="text-sm">{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

function PerformanceSkeleton({ loadingLabel }: { loadingLabel: string }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">{loadingLabel}</span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

/* ---------------------------------- view ---------------------------------- */

export function PerformanceView() {
  const { t } = useI18n();
  const { data, loading, error, refresh } = useOps<PerformanceRowDTO[]>("performance", undefined, {
    pollMs: 30_000,
  });
  const [metric, setMetric] = useState<MetricKey>("calls");

  /* Cross-view mutations (leads/calls edits) → silent refetch, via a stable ref. */
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => onOpsChanged(() => refreshRef.current()), []);

  const rows = useMemo<PerformanceRowDTO[]>(() => data ?? [], [data]);

  /* Chart series for the selected metric — one bar per row, label on XAxis. */
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        key: `${r.kind}:${r.label}`,
        label: r.label,
        value: r[metric],
        fill: kindFill(r.kind),
      })),
    [rows, metric]
  );

  /* Best (max) value per column → emerald highlight in the table. */
  const bestByCol = useMemo(() => {
    const cols = [...METRICS.map((m) => m.key), "conversionRate"] as (MetricKey | "conversionRate")[];
    const map = new Map<string, number>();
    for (const col of cols) {
      map.set(col, rows.reduce((mx, r) => Math.max(mx, r[col]), 0));
    }
    return map;
  }, [rows]);

  /* Summary totals for the KPI row. */
  const totals = useMemo(
    () => ({
      calls: rows.reduce((a, r) => a + r.calls, 0),
      answered: rows.reduce((a, r) => a + r.answered, 0),
      interested: rows.reduce((a, r) => a + r.interested, 0),
      linked: rows.reduce((a, r) => a + r.linked, 0),
    }),
    [rows]
  );

  const aiRow = useMemo(() => rows.find((r) => r.kind === "ai") ?? null, [rows]);
  const bestSales = useMemo(() => {
    const sales = rows.filter((r) => r.kind === "sales");
    if (sales.length === 0) return null;
    return sales.reduce((a, b) => (b.conversionRate > a.conversionRate ? b : a));
  }, [rows]);

  const activeMetric = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  const metricName = t(activeMetric.i18n);

  /* Computed Arabic insight (inline literal is intentional). */
  const insight = useMemo<string>(() => {
    if (aiRow && bestSales) {
      return `AI Bot أكمل ${aiRow.calls} محاولة بمعدل تحويل ${fmtPct(aiRow.conversionRate)} مقابل ${fmtPct(
        bestSales.conversionRate
      )} لأفضل موظف مبيعات (${bestSales.label})`;
    }
    if (aiRow) {
      return `AI Bot أكمل ${aiRow.calls} محاولة بمعدل تحويل ${fmtPct(aiRow.conversionRate)} — لا يوجد موظفو مبيعات للمقارنة بعد`;
    }
    if (bestSales) {
      return `لا توجد بيانات للـ AI Bot بعد — أفضل موظف مبيعات حاليًا: ${bestSales.label} بمعدل تحويل ${fmtPct(
        bestSales.conversionRate
      )}`;
    }
    return "لا توجد بيانات كافية لاستخلاص مقارنة — ستظهر النتائج بعد تشغيل أول حملة مكالمات";
  }, [aiRow, bestSales]);

  const retryButton = (
    <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => refresh()}>
      <RefreshCw className="size-4" aria-hidden="true" />
      {t("ops.retry")}
    </Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader title={t("perf.title")} desc={t("perf.desc")} />

      {/* Loading skeleton */}
      {!data && loading ? <PerformanceSkeleton loadingLabel={t("ops.loading")} /> : null}

      {/* Error + retry */}
      {!(!data && loading) && error && rows.length === 0 ? (
        <Card role="alert" className="border-amber-500/30">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-medium">{t("ops.errorLoad")}</p>
              <p className="mt-1 text-xs text-muted-foreground tnum">{error}</p>
            </div>
            {retryButton}
          </CardContent>
        </Card>
      ) : null}

      {/* Empty state */}
      {!(!data && loading) && !error && rows.length === 0 ? (
        <EmptyState icon={BarChart3} title={t("common.noData")} action={retryButton} />
      ) : null}

      {/* Content */}
      {rows.length > 0 && !(error && rows.length === 0) ? (
        <>
          {/* KPI totals */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label={t("perf.calls")} value={totals.calls} icon={PhoneCall} tone="neutral" />
            <StatCard label={t("perf.answered")} value={totals.answered} icon={CheckCheck} tone="success" />
            <StatCard label={t("perf.interested")} value={totals.interested} icon={UserCheck} tone="violet" />
            <StatCard label={t("perf.linked")} value={totals.linked} icon={Link2} tone="warning" />
          </div>

          {/* Comparison bar chart — one bar per row (sales = emerald, AI = violet) */}
          <ChartCard
            title={metricName}
            actions={
              <Tabs value={metric} onValueChange={(v) => setMetric(v as MetricKey)}>
                <TabsList className="h-auto flex-wrap">
                  {METRICS.map((m) => (
                    <TabsTrigger key={m.key} value={m.key} className="h-7 px-2.5 text-xs">
                      {t(m.i18n)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            }
          >
            <div className="h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    tickFormatter={trimTick}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelStyle={{ color: "var(--foreground)" }}
                    cursor={{ fill: "var(--muted)" }}
                  />
                  <Bar dataKey="value" name={metricName} radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {chartData.map((d) => (
                      <Cell key={d.key} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: SALES_FILL }} />
                {t("perf.salesTeam")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: AI_FILL }} />
                {t("perf.aiAgent")}
              </span>
            </div>
          </ChartCard>

          {/* Comparison table — best value per column highlighted in emerald */}
          <ChartCard title={t("perf.desc")}>
            <div className="max-h-96 overflow-y-auto sc-scroll">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>{t("common.agent")}</TableHead>
                    {METRICS.map((m) => (
                      <TableHead key={m.key} className="text-end">
                        {t(m.i18n)}
                      </TableHead>
                    ))}
                    <TableHead className="text-end">{t("perf.conversion")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.kind}:${r.label}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex size-7 shrink-0 items-center justify-center rounded-full",
                              r.kind === "sales"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            )}
                          >
                            {r.kind === "sales" ? (
                              <User className="size-3.5" aria-hidden="true" />
                            ) : (
                              <Bot className="size-3.5" aria-hidden="true" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">{r.label}</p>
                            <Badge
                              variant="outline"
                              className={cn("mt-0.5 px-1.5 py-0 text-[10px] font-medium", KIND_BADGE[r.kind])}
                            >
                              {r.kind === "sales" ? t("perf.salesTeam") : t("perf.aiAgent")}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      {METRICS.map((m) => (
                        <TableCell key={m.key} className={metricCellCls(r[m.key], bestByCol.get(m.key))}>
                          {r[m.key]}
                        </TableCell>
                      ))}
                      <TableCell className={metricCellCls(r.conversionRate, bestByCol.get("conversionRate"))}>
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[13px]">{fmtPct(r.conversionRate)}</span>
                          <Progress
                            value={clampPct(r.conversionRate)}
                            aria-label={`${r.label} — ${t("perf.conversion")}`}
                            className={cn(
                              "h-1.5 w-24",
                              r.kind === "sales"
                                ? "[&>div]:bg-emerald-500 dark:[&>div]:bg-emerald-400"
                                : "[&>div]:bg-violet-500 dark:[&>div]:bg-violet-400"
                            )}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ChartCard>

          {/* Summary insight + demo-mode chip */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 md:p-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <Bot className="size-4" aria-hidden="true" />
              </span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">{insight}</p>
              <Badge
                variant="outline"
                className="shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
              >
                <FlaskConical aria-hidden="true" />
                {t("ops.demoMode")}
              </Badge>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
