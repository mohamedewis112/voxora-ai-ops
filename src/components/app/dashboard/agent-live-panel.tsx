"use client";

/**
 * Live agent control panel — the operational heart of the dashboard.
 * Shows the realtime state machine (offline → ready → calling → connected →
 * speaking/listening → completed) driven by the active TelephonyProvider.
 */

import { useMemo } from "react";
import { Bot, Pause, Phone, PhoneCall, PhoneForwarded, Play, Square, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useAgentStore } from "@/stores/agent-store";
import { useDataStore } from "@/stores/data-store";
import { getTelephony } from "@/services/telephony";
import { agentStatusMeta, directionMeta } from "@/lib/status";
import { StatusBadge } from "@/components/app/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AgentLivePanel({ className }: { className?: string }) {
  const { t, fmtDuration, fmtTime, lang } = useI18n();
  const status = useAgentStore((s) => s.status);
  const currentCall = useAgentStore((s) => s.currentCall);
  const lastFinished = useAgentStore((s) => s.lastFinished);
  const campaignName = useDataStore((s) =>
    s.campaigns.find((c) => c.id === currentCall?.campaignId)?.name
  );
  const waitingCount = useDataStore((s) => s.queue.filter((q) => q.status === "waiting").length);
  const meta = agentStatusMeta[status];

  const live = status !== "offline";
  const inCall = !!currentCall;
  const talking = status === "speaking" || status === "listening" || status === "connected";
  const recentFinish = lastFinished && Date.now() - lastFinished.at < 6000;

  const control = (fn: () => Promise<void>) => () => {
    try {
      void fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const onStart = control(() => getTelephony().startAgent());
  const onPause = control(() => getTelephony().pauseAgent());
  const onStop = control(() => getTelephony().stopAgent());
  const onSimulate = control(async () => {
    const ds = useDataStore.getState();
    const next = ds.queue.find((q) => q.status === "waiting");
    if (!next) {
      toast.warning(t("dash.queueEmpty"));
      return;
    }
    await getTelephony().startCall({ id: next.contactId, name: next.name, phone: next.phone, campaignId: next.campaignId });
  });

  const onTransfer = control(async () => {
    if (!currentCall) return;
    await getTelephony().transferCall(currentCall.id, "sales");
  });

  const lastLines = useMemo(() => currentCall?.transcript.slice(-4) ?? [], [currentCall]);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex-row items-center justify-between gap-3 border-b border-border/60 py-3.5">
        <div className="flex items-center gap-3">
          <span className={cn("flex size-10 items-center justify-center rounded-xl bg-primary/10", live && "sc-live-dot text-primary")}>
            <Bot className="size-5 text-primary" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">{t("dash.liveTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("dash.liveAgentName")}</p>
          </div>
        </div>
        <StatusBadge tone={meta.tone} label={t(meta.key)} live={live && status !== "ready"} />
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* Live call card */}
        {currentCall ? (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary/15">
                  <UserRound className="size-5 text-primary" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[11px] text-muted-foreground">{t("dash.currentlyCalling")}</p>
                  <p className="text-[15px] font-semibold leading-tight">{currentCall.name}</p>
                  <p dir="ltr" className="text-xs text-muted-foreground tnum">{currentCall.phone}</p>
                </div>
              </div>
              <div className="text-end">
                <p className="text-2xl font-bold tnum leading-none text-primary">{fmtDuration(currentCall.durationSec)}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{campaignName ?? "—"}</p>
              </div>
            </div>

            {/* State wave */}
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              {talking ? (
                <span className="sc-wave text-primary" aria-hidden="true">
                  <span /><span /><span /><span /><span />
                </span>
              ) : (
                <Phone className="size-3.5 animate-pulse text-primary" aria-hidden="true" />
              )}
              <span className={cn(status === "speaking" && "text-foreground")}>{t(agentStatusMeta[status].key)}</span>
              <button
                type="button"
                onClick={onTransfer}
                className="ms-auto inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-600 transition-colors hover:bg-violet-500/20 dark:text-violet-400"
              >
                <PhoneForwarded className="size-3" aria-hidden="true" />
                {t("settings.destSales")}
              </button>
            </div>

            {/* Live transcript */}
            {lastLines.length > 0 ? (
              <div className="sc-scroll mt-3 max-h-36 space-y-2 overflow-y-auto rounded-lg bg-background/60 p-3">
                {lastLines.map((line) => (
                  <div key={line.id} className={cn(
                    "flex flex-col gap-0.5",
                    line.speaker === "agent" && "items-start",
                    line.speaker === "customer" && "items-end",
                    line.speaker === "system" && "items-center"
                  )}>
                    <span className="text-[10px] font-medium text-muted-foreground/80">
                      {line.speaker === "agent" ? t("calls.agentLine") : line.speaker === "customer" ? t("calls.customerLine") : t("calls.systemLine")}
                      {" · "}
                      {fmtDuration(line.atSec)}
                    </span>
                    <span
                      className={cn(
                        "max-w-[92%] rounded-xl px-3 py-1.5 text-[13px] leading-relaxed",
                        line.speaker === "agent" && "bg-primary/15 text-foreground",
                        line.speaker === "customer" && "bg-muted text-foreground",
                        line.speaker === "system" && "bg-violet-500/10 text-violet-600 dark:text-violet-300"
                      )}
                    >
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-center text-xs text-muted-foreground">{t("agentStatus.calling")}…</p>
            )}
          </div>
        ) : recentFinish ? (
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
            <p className="text-sm font-medium">{t("dash.finished")} — {lastFinished!.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dash.outcomeWas")}:{" "}
              <span className="font-medium text-foreground">{t(`outcome.${lastFinished!.outcome}`)}</span>
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {status === "offline" ? t("dash.agentOfflineHint")
                : status === "ready" ? t("dash.agentIdle")
                : status === "paused" ? t("dash.pausedHint")
                : t("dash.agentIdle")}
            </p>
            {status === "ready" ? (
              <p className="mt-1 text-xs text-muted-foreground/70 tnum">
                {waitingCount} {t("nav.queue")}
              </p>
            ) : null}
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={onStart}
            disabled={status === "ready" || inCall}
            className="flex-1 min-w-[110px]"
            size="sm"
          >
            <Play className="size-4" />
            {t("dash.start")}
          </Button>
          <Button
            onClick={onPause}
            variant="secondary"
            disabled={!live || (status === "paused" && !inCall)}
            className="flex-1 min-w-[110px]"
            size="sm"
          >
            <Pause className="size-4" />
            {t("dash.pause")}
          </Button>
          <Button
            onClick={onStop}
            variant="outline"
            disabled={!live}
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive flex-1 min-w-[110px]"
            size="sm"
          >
            <Square className="size-4" />
            {t("dash.stop")}
          </Button>
          {!inCall && live ? (
            <Button onClick={onSimulate} variant="secondary" size="sm" className="w-full sm:w-auto">
              <PhoneCall className="size-4" />
              {t("dash.simulateCall")}
            </Button>
          ) : null}
        </div>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70">
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
          {t("app.simulation")} — {t("app.simulationNote")}
        </p>
      </CardContent>
    </Card>
  );
}
