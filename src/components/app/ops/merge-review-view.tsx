"use client";

/**
 * Voxora AI — Merge review view (مراجعة الدمج).
 *
 * Fetches merge jobs (GET duplicates → MergeJobDTO[]) and splits them into:
 *  - pending_review jobs rendered as two-column compare cards with
 *    merge / reject / manual-review actions (merge is confirm-guarded);
 *  - resolved jobs rendered as a compact history table (click → read-only
 *    "open both listings" dialog with the applied field changes).
 *
 * Mutations POST merge/:id/action { action } then refresh + notifyOpsChanged().
 * Strings without an i18n key are written as inline Arabic literals (missing
 * keys reported: merge.fieldWhatsapp/address/description/images/openingHours/
 * owner/hasOwner/keptValue/fromValue/mergeConfirmDesc).
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  GitMerge,
  History,
  Loader2,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import type { Tone } from "@/lib/status";
import type {
  ListingDTO,
  MergeFieldChangeDTO,
  MergeJobDTO,
} from "@/lib/ops-types";
import { notifyOpsChanged, opsPost, useOps } from "@/hooks/use-ops";
import { PageHeader } from "@/components/app/shared/page-header";
import { EmptyState } from "@/components/app/shared/empty-state";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { ConfirmDialog } from "@/components/app/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type MergeAction = "merge" | "reject" | "manual_review";

const POLL_MS = 40_000;

/* ------------- inline Arabic literals (no i18n key yet) ------------- */

const LBL_WHATSAPP = "واتساب";
const LBL_ADDRESS = "العنوان";
const LBL_DESCRIPTION = "الوصف";
const LBL_IMAGES = "الصور";
const LBL_HOURS = "ساعات العمل";
const LBL_OWNER = "المالك";
const LBL_HAS_OWNER = "مرتبط بمالك";
const LBL_KEPT = "الموجود";
const LBL_FROM = "من الجديد";
const MERGE_CONFIRM_DESC =
  "النشاط الأصلي يبقى مرجعيًا والمكرر يوسم merged — يمكن استرجاعه من الإعدادات";

/* --------------------------- status metadata ------------------------- */

const MERGE_STATUS_TONE: Record<string, Tone> = {
  auto_merged: "success",
  merged: "success",
  rejected: "danger",
  manual_review: "warning",
  pending_review: "warning",
};
const MERGE_STATUS_KEYS = new Set(Object.keys(MERGE_STATUS_TONE));

const CHANGE_ACTION_META: Record<
  MergeFieldChangeDTO["action"],
  { key: string; tone: Tone }
> = {
  kept_existing: { key: "merge.keptExisting", tone: "neutral" },
  filled_from_new: { key: "merge.filledFromNew", tone: "success" },
  appended: { key: "merge.appended", tone: "warning" },
};

/** Field-name → Arabic label map for change rows (unknown fields fall back to the raw name). */
const FIELD_LABELS: Record<string, string> = {
  businessName: "اسم النشاط",
  rawPhone: "الرقم كما ورد",
  normalizedPhone: "رقم الهاتف",
  whatsapp: LBL_WHATSAPP,
  category: "التصنيف",
  governorate: "المحافظة",
  city: "المدينة",
  village: "القرية",
  address: LBL_ADDRESS,
  description: LBL_DESCRIPTION,
  images: LBL_IMAGES,
  openingHours: LBL_HOURS,
  ownerUserId: LBL_OWNER,
  status: "الحالة",
};

/* --------------------------- compare helpers ------------------------- */

type CompareKey =
  | "businessName"
  | "phone"
  | "whatsapp"
  | "category"
  | "location"
  | "address"
  | "description"
  | "images"
  | "hours"
  | "owner";

/** Ordered field rows shown in each compare panel. */
const COMPARE_ROWS: {
  key: CompareKey;
  tKey?: string;
  label?: string;
  ltr?: boolean;
  clamp?: boolean;
}[] = [
  { key: "phone", tKey: "ops.phone", ltr: true },
  { key: "whatsapp", label: LBL_WHATSAPP, ltr: true },
  { key: "category", tKey: "common.category" },
  { key: "location", tKey: "unclaimed.location" },
  { key: "address", label: LBL_ADDRESS },
  { key: "description", label: LBL_DESCRIPTION, clamp: true },
  { key: "images", label: LBL_IMAGES },
  { key: "hours", label: LBL_HOURS },
  { key: "owner", label: LBL_OWNER },
];

function listingValues(l: ListingDTO | null | undefined): Record<CompareKey, string> {
  return {
    businessName: l?.businessName ?? "",
    phone: l?.normalizedPhone ?? "",
    whatsapp: l?.whatsapp ?? "",
    category: l?.category ?? "",
    location: [l?.governorate, l?.city, l?.village]
      .filter((x): x is string => Boolean(x))
      .join(" — "),
    address: l?.address ?? "",
    description: l?.description ?? "",
    images: l ? String(Array.isArray(l.images) ? l.images.length : 0) : "0",
    hours: l?.openingHours ?? "",
    owner: l?.ownerUserId ? "1" : "",
  };
}

function diffKeys(a: ListingDTO | null | undefined, b: ListingDTO | null | undefined): Set<CompareKey> {
  const va = listingValues(a);
  const vb = listingValues(b);
  const keys = new Set<CompareKey>();
  for (const k of Object.keys(va) as CompareKey[]) {
    if (va[k] !== vb[k]) keys.add(k);
  }
  return keys;
}

function confidenceTone(c: number): Tone {
  if (c >= 85) return "success";
  if (c >= 55) return "warning";
  return "neutral";
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

/** Renders unknown JSON values (kept/from) as compact strings. */
function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) {
    return v.length === 0
      ? "—"
      : v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("، ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/* ================================ view ================================ */

export function MergeReviewView() {
  const { t, fmtDateTime } = useI18n();
  const jobs = useOps<MergeJobDTO[]>("duplicates", undefined, { pollMs: POLL_MS });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmMerge, setConfirmMerge] = useState<MergeJobDTO | null>(null);
  const [openJob, setOpenJob] = useState<MergeJobDTO | null>(null);

  const pending = useMemo(
    () =>
      (jobs.data ?? [])
        .filter((j) => j.status === "pending_review")
        .sort((a, b) => b.confidence - a.confidence),
    [jobs.data]
  );
  const history = useMemo(
    () =>
      (jobs.data ?? [])
        .filter((j) => j.status !== "pending_review")
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    [jobs.data]
  );

  const act = async (job: MergeJobDTO, action: MergeAction): Promise<void> => {
    setBusyId(job.id);
    try {
      await opsPost(`merge/${job.id}/action`, { action });
      if (action === "merge") {
        toast.success(t("merge.mergedToast"));
        if (job.fieldChanges.length > 0) {
          toast.info(`${t("merge.fieldChanges")}: ${job.fieldChanges.length}`);
        }
      } else if (action === "reject") {
        toast.success(t("unclaimed.rejectedToast"));
      } else {
        toast.info(t("merge.pending"));
      }
      jobs.refresh();
      notifyOpsChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("ops.errorLoad"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t("merge.title")} desc={t("merge.desc")} />

      {jobs.error && !jobs.data ? (
        <EmptyState
          icon={AlertTriangle}
          title={t("ops.errorLoad")}
          action={
            <Button variant="outline" onClick={() => jobs.refresh()}>
              <RotateCw className="size-4" aria-hidden="true" />
              {t("ops.retry")}
            </Button>
          }
        />
      ) : jobs.loading && !jobs.data ? (
        <div className="space-y-4" aria-hidden="true">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-44 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* -------- pending review cards -------- */}
          {pending.length === 0 ? (
            <EmptyState icon={GitMerge} title={t("merge.noPending")} />
          ) : (
            <div className="space-y-4">
              {pending.map((job) => (
                <PendingCard
                  key={job.id}
                  job={job}
                  busy={busyId === job.id}
                  anyBusy={busyId !== null}
                  onAction={(a) => {
                    void act(job, a);
                  }}
                  onConfirm={() => setConfirmMerge(job)}
                  onOpen={() => setOpenJob(job)}
                />
              ))}
            </div>
          )}

          {/* -------- merge history table -------- */}
          {history.length > 0 ? (
            <section aria-label={t("merge.history")} className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <History className="size-4 text-muted-foreground" aria-hidden="true" />
                {t("merge.history")}
                <span className="text-xs font-normal text-muted-foreground tnum">
                  ({history.length})
                </span>
              </h2>
              <Card className="gap-0 border-border/70 py-0">
                <CardContent className="p-0">
                  <div className="max-h-96 overflow-y-auto sc-scroll">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>{t("merge.canonical")}</TableHead>
                          <TableHead>{t("merge.duplicate")}</TableHead>
                          <TableHead>{t("merge.confidence")}</TableHead>
                          <TableHead>{t("ops.status")}</TableHead>
                          <TableHead>{t("common.date")}</TableHead>
                          <TableHead className="w-10">
                            <span className="sr-only">{t("merge.openBoth")}</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {history.map((j) => (
                          <TableRow
                            key={j.id}
                            tabIndex={0}
                            role="button"
                            aria-label={`${j.canonical?.businessName ?? "—"} — ${j.duplicate?.businessName ?? "—"}`}
                            className="cursor-pointer"
                            onClick={() => setOpenJob(j)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setOpenJob(j);
                              }
                            }}
                          >
                            <TableCell className="max-w-48 truncate font-medium">
                              {j.canonical?.businessName ?? "—"}
                            </TableCell>
                            <TableCell className="max-w-48 truncate text-muted-foreground">
                              {j.duplicate?.businessName ?? "—"}
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                tone={confidenceTone(j.confidence)}
                                label={`${Math.round(j.confidence)}%`}
                                dot={false}
                              />
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                tone={MERGE_STATUS_TONE[j.status] ?? "neutral"}
                                label={MERGE_STATUS_KEYS.has(j.status) ? t(`merge.status.${j.status}`) : j.status}
                              />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground tnum">
                              {fmtDateTime(j.createdAt)}
                            </TableCell>
                            <TableCell>
                              <Eye className="size-3.5 text-muted-foreground" aria-hidden="true" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </>
      )}

      <OpenBothDialog job={openJob} onClose={() => setOpenJob(null)} />

      <ConfirmDialog
        open={confirmMerge !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmMerge(null);
        }}
        title={t("merge.actionMerge")}
        desc={MERGE_CONFIRM_DESC}
        confirmLabel={t("merge.actionMerge")}
        cancelLabel={t("ops.cancel")}
        onConfirm={() => {
          if (confirmMerge) void act(confirmMerge, "merge");
        }}
      />
    </div>
  );
}

/* --------------------------- pending card ---------------------------- */

function PendingCard({
  job,
  busy,
  anyBusy,
  onAction,
  onConfirm,
  onOpen,
}: {
  job: MergeJobDTO;
  busy: boolean;
  anyBusy: boolean;
  onAction: (action: MergeAction) => void;
  onConfirm: () => void;
  onOpen: () => void;
}) {
  const { t, fmtDateTime } = useI18n();
  const diff = useMemo(
    () => diffKeys(job.canonical, job.duplicate),
    [job.canonical, job.duplicate]
  );

  return (
    <Card className="border-border/70">
      <CardContent className="flex flex-col gap-4 p-5">
        {/* header — status, confidence, date */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <StatusBadge tone="warning" label={t("merge.pending")} />
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {t("merge.confidence")}
            <StatusBadge
              tone={confidenceTone(job.confidence)}
              label={`${Math.round(job.confidence)}%`}
              dot={false}
            />
          </span>
          <span className="ms-auto text-xs text-muted-foreground tnum">
            {fmtDateTime(job.createdAt)}
          </span>
        </div>

        {/* match reasons as chips */}
        {job.reasons.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("merge.reasons")}
            </span>
            {job.reasons.map((r) => (
              <span
                key={r.code}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-xs"
              >
                <span className="max-w-56 truncate">{r.label}</span>
                <span className="tnum text-[10px] text-muted-foreground">{r.score}</span>
              </span>
            ))}
          </div>
        ) : null}

        {/* two-column compare (stacked on mobile) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <ListingPanel kind="canonical" label={t("merge.canonical")} listing={job.canonical} diff={diff} />
          <ListingPanel kind="duplicate" label={t("merge.duplicate")} listing={job.duplicate} diff={diff} />
        </div>

        {/* actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="destructive" size="sm" disabled={anyBusy} onClick={onConfirm}>
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <GitMerge className="size-3.5" aria-hidden="true" />
            )}
            {t("merge.actionMerge")}
          </Button>
          <Button variant="outline" size="sm" disabled={anyBusy} onClick={() => onAction("reject")}>
            {t("merge.actionReject")}
          </Button>
          <Button variant="ghost" size="sm" disabled={anyBusy} onClick={() => onAction("manual_review")}>
            {t("merge.actionManual")}
          </Button>
          <Button variant="ghost" size="sm" className="ms-auto" onClick={onOpen}>
            <Eye className="size-3.5" aria-hidden="true" />
            {t("merge.openBoth")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------- compare panel --------------------------- */

function ListingPanel({
  kind,
  label,
  listing,
  diff,
}: {
  kind: "canonical" | "duplicate";
  label: string;
  listing: ListingDTO | null | undefined;
  diff: Set<CompareKey>;
}) {
  const { t } = useI18n();
  const values = listingValues(listing);

  return (
    <div
      className={cn(
        "rounded-xl border p-3.5",
        kind === "canonical"
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-amber-500/25 bg-amber-500/5"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            kind === "canonical" ? "bg-emerald-500" : "bg-amber-500"
          )}
          aria-hidden="true"
        />
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        {diff.has("businessName") ? (
          <span className="ms-auto size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-sm font-semibold">
        {listing?.businessName || "—"}
      </p>

      <div className="mt-2 divide-y divide-border/50">
        {COMPARE_ROWS.map((row) => {
          const raw = row.key === "owner" ? (values.owner ? LBL_HAS_OWNER : "") : values[row.key];
          return (
            <FieldRow
              key={row.key}
              label={row.tKey ? t(row.tKey) : row.label ?? ""}
              value={raw}
              differs={diff.has(row.key)}
              ltr={row.ltr}
              clamp={row.clamp}
            />
          );
        })}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  differs,
  ltr,
  clamp,
}: {
  label: string;
  value: string;
  differs: boolean;
  ltr?: boolean;
  clamp?: boolean;
}) {
  return (
    <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-baseline gap-2 py-1.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {differs ? (
          <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      {value ? (
        <span
          dir={ltr ? "ltr" : undefined}
          className={cn(
            "text-sm leading-relaxed break-words",
            ltr && "tnum",
            clamp && "line-clamp-3"
          )}
        >
          {value}
        </span>
      ) : (
        <span className="text-sm text-muted-foreground/70">—</span>
      )}
    </div>
  );
}

/* -------------------------- open-both dialog -------------------------- */

function OpenBothDialog({ job, onClose }: { job: MergeJobDTO | null; onClose: () => void }) {
  const { t } = useI18n();
  const diff = useMemo(
    () => diffKeys(job?.canonical, job?.duplicate),
    [job?.canonical, job?.duplicate]
  );

  if (!job) return null;

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-3xl sc-scroll"
      >
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle className="text-base">{t("merge.openBoth")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <ListingPanel kind="canonical" label={t("merge.canonical")} listing={job.canonical} diff={diff} />
            <ListingPanel kind="duplicate" label={t("merge.duplicate")} listing={job.duplicate} diff={diff} />
          </div>

          {job.fieldChanges.length > 0 ? (
            <>
              <Separator />
              <div>
                <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                  {t("merge.fieldChanges")}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tnum">
                    {job.fieldChanges.length}
                  </span>
                </p>
                <div className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/70">
                  {job.fieldChanges.map((c, i) => (
                    <ChangeRow key={`${c.field}-${i}`} change={c} />
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangeRow({ change }: { change: MergeFieldChangeDTO }) {
  const { t } = useI18n();
  const meta = CHANGE_ACTION_META[change.action];

  return (
    <div className="px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">{fieldLabel(change.field)}</span>
        <StatusBadge tone={meta.tone} label={t(meta.key)} dot={false} className="ms-auto" />
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>
          {LBL_KEPT}: <span dir="auto" className="tnum">{fmtValue(change.kept)}</span>
        </span>
        <span>
          {LBL_FROM}: <span dir="auto" className="tnum">{fmtValue(change.from)}</span>
        </span>
      </div>
    </div>
  );
}
