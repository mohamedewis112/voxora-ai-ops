"use client";

/**
 * Voxora AI — unified lead timeline renderer (shared by the sales workspace).
 * One timeline per lead: assignments, calls, WhatsApp, bot runs, linking, notes.
 * Actor labels are explicit (AI / Sales / System / Admin) so sources never blur.
 */
import { Bot, PhoneCall, StickyNote, Link2, UserRound, Cog, MessageCircle, Sparkles, ShieldAlert, History } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { TimelineEventDTO } from "@/lib/ops-types";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, typeof PhoneCall> = {
  created: Sparkles,
  assigned: UserRound,
  lead_attached: History,
  call_outcome: PhoneCall,
  transferred: UserRound,
  note: StickyNote,
  whatsapp_sent: MessageCircle,
  whatsapp_received: MessageCircle,
  bot_added: Bot,
  bot_started: Bot,
  bot_result: Bot,
  bot_removed: Bot,
  bot_returned: Bot,
  ownership_linked: Link2,
  callback_scheduled: PhoneCall,
  listing_merged: Link2,
  listing_hidden: ShieldAlert,
};

const TYPE_TONE: Record<string, string> = {
  bot_added: "text-violet-500 bg-violet-500/10",
  bot_started: "text-violet-500 bg-violet-500/10",
  bot_result: "text-violet-500 bg-violet-500/10",
  bot_returned: "text-violet-500 bg-violet-500/10",
  bot_removed: "text-rose-500 bg-rose-500/10",
  call_outcome: "text-primary bg-primary/10",
  whatsapp_sent: "text-teal-500 bg-teal-500/10",
  whatsapp_received: "text-teal-500 bg-teal-500/10",
  ownership_linked: "text-emerald-500 bg-emerald-500/10",
  listing_merged: "text-emerald-500 bg-emerald-500/10",
  listing_hidden: "text-rose-500 bg-rose-500/10",
  transferred: "text-amber-500 bg-amber-500/10",
  created: "text-primary bg-primary/10",
  assigned: "text-zinc-400 bg-zinc-500/10",
};

export function LeadTimeline({ events }: { events: TimelineEventDTO[] }) {
  const { t, fmtDateTime } = useI18n();
  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("ops.loading")}</p>;
  }
  return (
    <ol className="relative space-y-3 ps-1" role="list">
      {events.map((e) => {
        const Icon = TYPE_ICON[e.type] ?? Cog;
        const tone = TYPE_TONE[e.type] ?? "text-muted-foreground bg-muted";
        const actorLabel = e.actorName || t(`sales.actor.${e.actorType}`);
        return (
          <li key={e.id} className="flex gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                tone
              )}
              aria-hidden="true"
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <p className="text-[13px] leading-snug">{e.title}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                <span className="font-medium">{actorLabel}</span>
                <span aria-hidden="true"> · </span>
                <span className="tnum">{fmtDateTime(e.createdAt)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
