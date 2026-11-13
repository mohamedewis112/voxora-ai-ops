"use client";

/**
 * Call details drawer — recording placeholder, transcript with speech
 * bubbles, AI summary/notes, extracted info and follow-up action.
 */

import { AudioLines, Bot, PhoneCall, PhoneForwarded, UserRound, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { getTelephony } from "@/services/telephony";
import { callStatusMeta, outcomeMeta, sentimentMeta, directionMeta } from "@/lib/status";
import type { Call } from "@/lib/types";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { ScoreBadge } from "@/components/app/shared/score-badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function CallDetailsSheet({
  call,
  open,
  onOpenChange,
}: {
  call: Call | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, fmtDuration, fmtDateTime } = useI18n();
  const campaigns = useDataStore((s) => s.campaigns);

  if (!call) return null;

  const resMeta = call.status === "answered" ? outcomeMeta[call.outcome] : callStatusMeta[call.status];
  const campaignName = campaigns.find((x) => x.id === call.campaignId)?.name ?? "—";

  const onCallAgain = async () => {
    try {
      await getTelephony().startCall({
        id: call.contactId ?? "",
        name: call.contactName,
        phone: call.phone,
        campaignId: call.campaignId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  // Deterministic pseudo waveform from the call id.
  const bars = Array.from({ length: 36 }, (_, i) => {
    const h = Math.abs(Math.sin(call.id.charCodeAt(i % call.id.length) * (i + 3)));
    return 20 + h * 80;
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined} side="left" className="w-full overflow-y-auto p-0 sm:max-w-lg sc-scroll">
        <SheetHeader className="border-b border-border/60 px-5 py-4 text-start">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/15">
              <UserRound className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">{call.contactName}</SheetTitle>
              <p dir="ltr" className="text-sm text-muted-foreground tnum">{call.phone}</p>
            </div>
            <div className="ms-auto flex flex-col items-end gap-1.5">
              <StatusBadge tone={resMeta.tone} label={t(resMeta.key)} />
              <StatusBadge tone={directionMeta[call.direction].tone} label={t(directionMeta[call.direction].key)} dot={false} />
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 px-5 py-4">
          {/* Meta grid */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-border/70 bg-background/40 p-4 text-sm sm:grid-cols-3">
            <Meta label={t("common.date")} value={fmtDateTime(call.startedAt)} />
            <Meta label={t("common.duration")} value={fmtDuration(call.durationSec)} mono />
            <Meta label={t("common.campaign")} value={campaignName} />
            <Meta label={t("common.agent")} value="نور (AI)" />
            <Meta
              label={t("calls.sentiment")}
              valueNode={<StatusBadge tone={sentimentMeta[call.sentiment].tone} label={t(sentimentMeta[call.sentiment].key)} />}
            />
            <Meta
              label={t("common.score")}
              valueNode={
                <span className="flex items-center gap-2">
                  <ScoreBadge score={call.leadScore} />
                  <Progress value={call.leadScore} className="h-1.5 w-16" aria-label={t("common.score")} />
                </span>
              }
            />
          </div>

          {/* Recording placeholder */}
          <div className="rounded-xl border border-border/70 bg-background/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <AudioLines className="size-4 text-primary" aria-hidden="true" />
                {t("calls.record")}
              </p>
              <StatusBadge
                tone={call.recordingStatus === "pending" ? "warning" : call.recordingStatus === "available" ? "success" : "neutral"}
                label={t(`recording.${call.recordingStatus}`)}
              />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                aria-label={t("recordings.play")}
                title={t("recordings.playerSoon")}
                onClick={() => toast.info(t("recordings.playerSoon"))}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform hover:scale-105"
              >
                <Volume2 className="size-4" aria-hidden="true" />
              </button>
              <div className="flex h-10 flex-1 items-center gap-[3px]" aria-hidden="true">
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className="w-full max-w-[6px] rounded-full bg-muted-foreground/30"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground tnum">{fmtDuration(call.durationSec)}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground/70">{t("recordings.playerSoon")}</p>
          </div>

          {/* Summary */}
          <Section title={t("calls.summary")}>{call.summary}</Section>

          {/* AI notes */}
          <Section title={t("calls.aiNotes")} icon={<Bot className="size-4 text-primary" aria-hidden="true" />}>
            {call.aiNotes}
          </Section>

          {/* Extracted info */}
          {call.extracted.length > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium">{t("calls.extracted")}</p>
              <div className="flex flex-wrap gap-1.5">
                {call.extracted.map((f, i) => (
                  <span key={i} className="rounded-full border border-teal-500/25 bg-teal-500/10 px-2.5 py-1 text-xs text-teal-700 dark:text-teal-300">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Follow-up */}
          {call.followUpAction && call.followUpAction !== "لا يلزم متابعة" ? (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("calls.followUpAction")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{call.followUpAction}</p>
            </div>
          ) : null}

          {call.objection ? (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4">
              <p className="text-sm font-medium text-rose-600 dark:text-rose-400">{t("analytics.objections")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{call.objection}</p>
            </div>
          ) : null}

          {/* Transcript */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">{t("calls.transcript")}</p>
              <span className="text-xs text-muted-foreground tnum">
                {call.transcript.length} {t("common.items")}
              </span>
            </div>
            {call.transcript.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-6 text-center text-xs text-muted-foreground">
                {t("calls.noCalls")}
              </p>
            ) : (
              <div className="sc-scroll max-h-80 space-y-3 overflow-y-auto rounded-xl border border-border/70 bg-background/40 p-4">
                {call.transcript.map((line) => (
                  <div
                    key={line.id}
                    className={cn(
                      "flex flex-col gap-1",
                      line.speaker === "agent" && "items-start",
                      line.speaker === "customer" && "items-end",
                      line.speaker === "system" && "items-center"
                    )}
                  >
                    <span className="text-[10px] text-muted-foreground/70 tnum">
                      {line.speaker === "agent" ? t("calls.agentLine") : line.speaker === "customer" ? t("calls.customerLine") : t("calls.systemLine")}
                      {" · "}
                      {fmtDuration(line.atSec)}
                    </span>
                    <span
                      className={cn(
                        "max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed",
                        line.speaker === "agent" && "rounded-ss-sm bg-primary/15",
                        line.speaker === "customer" && "rounded-se-sm bg-muted",
                        line.speaker === "system" && "bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      )}
                    >
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <Button onClick={onCallAgain} className="w-full" variant="secondary">
            <PhoneCall className="size-4" />
            {t("calls.callAgain")}
          </Button>
          <Button
            variant="outline"
            className="w-full border-violet-500/40 text-violet-600 hover:bg-violet-500/10 hover:text-violet-600 dark:text-violet-400"
            onClick={async () => {
              try {
                await getTelephony().transferCall(call.id, "sales");
                toast.success(t("outcome.transferred"));
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <PhoneForwarded className="size-4" />
            {t("settings.destSales")} — {t("outcome.transferred")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Meta({
  label,
  value,
  valueNode,
  mono,
}: {
  label: string;
  value?: string;
  valueNode?: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {valueNode ?? (
        <p className={cn("mt-0.5 truncate text-[13px] font-medium", mono && "tnum")} dir={mono ? "ltr" : undefined}>
          {value ?? "—"}
        </p>
      )}
    </div>
  );
}

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 p-4">
      <p className="mb-1.5 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
