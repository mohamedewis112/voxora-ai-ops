"use client";

/**
 * Audit log ("سجل التدقيق") — every important operation with actor, action,
 * entity and before/after payloads. Filters run server-side via
 * GET /api/ops/audit?actor=&entity=&action= (contains match on action code).
 * Desktop: scrollable table with sticky header. Mobile: stacked cards.
 */

import { useEffect, useState } from "react";
import {
  Bot,
  ChevronDown,
  Filter,
  RefreshCw,
  ScrollText,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useOps } from "@/hooks/use-ops";
import type { ActorType, AuditLogDTO } from "@/lib/ops-types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/shared/page-header";
import { EmptyState } from "@/components/app/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/* ------------------------------- constants ------------------------------- */

const ACTOR_TYPES: readonly ActorType[] = ["admin", "sales_agent", "ai_agent", "system", "customer"];

const ENTITY_TYPES = ["lead", "listing", "merge_job", "sales_agent", "bot_queue_item"] as const;

const SEARCH_DEBOUNCE_MS = 350;

/** Chip classes per actor type — violet/emerald/amber/zinc only. */
const ACTOR_CHIP: Record<string, string> = {
  admin: "border-violet-500/25 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  sales_agent: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  ai_agent: "border-violet-500/40 bg-transparent text-violet-600 dark:text-violet-400",
  system: "border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  customer: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function isActorType(v: string): v is ActorType {
  return (ACTOR_TYPES as readonly string[]).includes(v);
}

/** Localized actor label with a safe fallback for unknown values. */
function actorLabel(t: (k: string) => string, actorType: string): string {
  return isActorType(actorType) ? t(`sales.actor.${actorType}`) : actorType;
}

function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : "—";
}

function isBlank(value: Record<string, unknown>): boolean {
  return !value || Object.keys(value).length === 0;
}

/** Pretty-printed JSON, LTR, inside a zinc card. */
function JsonBlock({ value }: { value: Record<string, unknown> }) {
  if (isBlank(value)) return <p className="text-xs text-muted-foreground">—</p>;
  return (
    <pre
      dir="ltr"
      className="sc-scroll tnum max-h-56 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200"
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Dialog field: small muted label + content. */
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

/** Actor chip — AI agent gets a violet outline badge with a Bot icon. */
function ActorChip({ log }: { log: AuditLogDTO }) {
  const { t } = useI18n();
  const isAi = log.actorType === "ai_agent";
  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="outline" className={cn("gap-1", ACTOR_CHIP[log.actorType] ?? ACTOR_CHIP.system)}>
        {isAi ? <Bot className="size-3" aria-hidden="true" /> : null}
        {actorLabel(t, log.actorType)}
      </Badge>
      {log.actorId ? (
        <span dir="ltr" className="font-mono text-[10px] text-muted-foreground">{log.actorId.slice(0, 8)}</span>
      ) : null}
    </div>
  );
}

/* --------------------------------- view ---------------------------------- */

export function AuditView() {
  const { t, fmtDateTime } = useI18n();

  // Server filters — the useOps hook refetches whenever these change.
  const [actor, setActor] = useState<string>("all");
  const [entity, setEntity] = useState<string>("all");
  const [actionInput, setActionInput] = useState("");
  const [actionQuery, setActionQuery] = useState("");
  const [selected, setSelected] = useState<AuditLogDTO | null>(null);

  // Debounce the action-code search before it hits the server.
  useEffect(() => {
    const id = window.setTimeout(() => setActionQuery(actionInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [actionInput]);

  const { data, loading, error, refresh } = useOps<AuditLogDTO[]>("audit", {
    actor: actor === "all" ? undefined : actor,
    entity: entity === "all" ? undefined : entity,
    action: actionQuery || undefined,
  });

  const logs = data ?? [];
  const hasFilters = actor !== "all" || entity !== "all" || actionInput.trim() !== "";
  const busy = loading && logs.length > 0; // refetch in background (filter change)

  const resetFilters = () => {
    setActor("all");
    setEntity("all");
    setActionInput("");
    setActionQuery("");
  };

  return (
    <div className="space-y-4" aria-busy={loading}>
      <PageHeader
        title={t("audit.title")}
        desc={t("audit.desc")}
        actions={
          data ? (
            <span className="tnum rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              {logs.length} {t("audit.records")}
            </span>
          ) : null
        }
      />

      {/* Server-side filters */}
      <Card className="border-border/70">
        <CardContent className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder={t("ops.search")}
              className="h-9 ps-9"
              aria-label={t("audit.action")}
            />
          </div>
          <Select value={actor} onValueChange={setActor}>
            <SelectTrigger className="h-9" aria-label={t("audit.actor")}>
              <SelectValue placeholder={t("audit.actor")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all")}</SelectItem>
              {ACTOR_TYPES.map((a) => (
                <SelectItem key={a} value={a}>{t(`sales.actor.${a}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Select value={entity} onValueChange={setEntity}>
              <SelectTrigger className="h-9 w-full" aria-label={t("audit.entity")}>
                <SelectValue placeholder={t("audit.entity")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("common.all")}</SelectItem>
                {ENTITY_TYPES.map((e) => (
                  <SelectItem key={e} value={e}>
                    <span dir="ltr" className="font-mono text-xs">{e}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={resetFilters} aria-label={t("common.reset")}>
                <Filter className="size-4" />
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Initial load skeleton */}
      {loading && !data ? (
        <Card className="border-border/70 p-3">
          <div className="space-y-2" role="status" aria-label={t("ops.loading")}>
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-11 w-full" style={{ width: `${94 - (i % 4) * 6}%` }} />
            ))}
          </div>
        </Card>
      ) : null}

      {/* Load error + retry */}
      {!loading && error ? (
        <Card className="border-border/70 p-6">
          <EmptyState
            icon={TriangleAlert}
            title={t("ops.errorLoad")}
            desc={error}
            action={
              <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
                <RefreshCw className="size-3.5" aria-hidden="true" />
                {t("ops.retry")}
              </Button>
            }
          />
        </Card>
      ) : null}

      {/* Desktop table */}
      {!loading && !error ? (
        <Card className={cn("hidden overflow-hidden border-border/70 md:block", busy && "pointer-events-none opacity-60 transition-opacity")}>
          <div className="max-h-[70vh] overflow-y-auto sc-scroll">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-start">{t("audit.when")}</TableHead>
                  <TableHead className="text-start">{t("audit.actor")}</TableHead>
                  <TableHead className="text-start">{t("audit.action")}</TableHead>
                  <TableHead className="text-start">{t("audit.entity")}</TableHead>
                  <TableHead className="text-start">{t("audit.reason")}</TableHead>
                  <TableHead className="text-end">{t("audit.details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id} className="cursor-pointer" onClick={() => setSelected(log)}>
                    <TableCell className="tnum text-[13px] text-muted-foreground">{fmtDateTime(log.createdAt)}</TableCell>
                    <TableCell><ActorChip log={log} /></TableCell>
                    <TableCell>
                      <span dir="ltr" className="font-mono text-xs">{log.action}</span>
                    </TableCell>
                    <TableCell>
                      <span dir="ltr" className="font-mono text-xs">{log.entityType}</span>
                      <span dir="ltr" className="block font-mono text-[10px] text-muted-foreground">{shortId(log.entityId)}</span>
                    </TableCell>
                    <TableCell>
                      {log.reason ? (
                        <p className="line-clamp-1 max-w-[240px] text-[13px] text-muted-foreground">{log.reason}</p>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => { e.stopPropagation(); setSelected(log); }}
                      >
                        {t("audit.details")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {logs.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={ScrollText}
                  title={t("audit.empty")}
                  action={
                    hasFilters ? (
                      <Button variant="outline" size="sm" onClick={resetFilters}>{t("common.reset")}</Button>
                    ) : undefined
                  }
                />
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Mobile cards */}
      {!loading && !error ? (
        <div className={cn("space-y-2.5 md:hidden", busy && "pointer-events-none opacity-60 transition-opacity")}>
          {logs.map((log) => (
            <button
              key={log.id}
              type="button"
              onClick={() => setSelected(log)}
              className="block w-full rounded-xl border border-border bg-card p-3.5 text-start transition-colors active:bg-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <ActorChip log={log} />
                <span className="tnum ms-auto text-[11px] text-muted-foreground">{fmtDateTime(log.createdAt)}</span>
              </div>
              <p dir="ltr" className="mt-2 font-mono text-xs">{log.action}</p>
              <p dir="ltr" className="font-mono text-[10px] text-muted-foreground">
                {log.entityType} · {shortId(log.entityId)}
              </p>
              {log.reason ? (
                <p className="mt-1.5 line-clamp-1 text-xs text-muted-foreground">{log.reason}</p>
              ) : null}
            </button>
          ))}
          {logs.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title={t("audit.empty")}
              action={
                hasFilters ? (
                  <Button variant="outline" size="sm" onClick={resetFilters}>{t("common.reset")}</Button>
                ) : undefined
              }
            />
          ) : null}
        </div>
      ) : null}

      {/* Row details */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent aria-describedby={undefined} className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-xl sc-scroll">
          {selected ? (
            <>
              <DialogHeader className="border-b border-border/60 px-5 py-4">
                <DialogTitle className="flex items-center gap-2 text-base">
                  <span dir="ltr" className="font-mono text-sm">{selected.action}</span>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {actorLabel(t, selected.actorType)} · {selected.entityType} · <span className="tnum">{fmtDateTime(selected.createdAt)}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 px-5 py-5">
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <Field label={t("audit.actor")}>
                    <ActorChip log={selected} />
                  </Field>
                  <Field label={t("audit.when")}>
                    <span className="tnum">{fmtDateTime(selected.createdAt)}</span>
                  </Field>
                  <Field label={t("audit.entity")}>
                    <span dir="ltr" className="font-mono text-xs">
                      {selected.entityType}
                      {selected.entityId ? ` · ${selected.entityId.slice(0, 8)}` : ""}
                    </span>
                  </Field>
                  <Field label={t("common.source")}>
                    <span dir="ltr" className="font-mono text-xs">{selected.source ?? t("common.none")}</span>
                  </Field>
                  <Field label={t("audit.reason")} className="sm:col-span-2">
                    {selected.reason ?? <span className="text-muted-foreground">—</span>}
                  </Field>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{t("audit.old")}</p>
                  <JsonBlock value={selected.oldValue} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{t("audit.new")}</p>
                  <JsonBlock value={selected.newValue} />
                </div>

                {isBlank(selected.metadata) ? (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{t("audit.metadata")}</p>
                    <p className="text-xs text-muted-foreground">—</p>
                  </div>
                ) : (
                  <Collapsible>
                    <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                      <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
                      {t("audit.metadata")}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <JsonBlock value={selected.metadata} />
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
