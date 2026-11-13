"use client";

/**
 * Premium app sidebar. Desktop: fixed rail. Mobile: rendered inside a Sheet
 * drawer by the header (see header.tsx) — same content component is reused.
 */

import Image from "next/image";
import {
  BarChart3,
  Bot,
  BotMessageSquare,
  CalendarClock,
  CircleDot,
  GitBranch,
  Headphones,
  LayoutDashboard,
  MessageCircle,
  PhoneCall,
  Radio,
  Scale,
  ScrollText,
  Settings,
  Store,
  UserRound,
  UserCheck,
  Users,
  AudioLines,
  FolderKanban,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { useAgentStore } from "@/stores/agent-store";
import { useUiStore, type ViewKey } from "@/stores/ui-store";
import { agentStatusMeta } from "@/lib/status";
import { StatusBadge } from "./shared/status-badge";
import { cn } from "@/lib/utils";

function NavItem({
  v,
  icon: Icon,
  label,
  badge,
  active,
  onSelect,
}: {
  v: ViewKey;
  icon: LucideIcon;
  label: string;
  badge?: number;
  active: boolean;
  onSelect: (v: ViewKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(v)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")}
        aria-hidden="true"
      />
      <span className="flex-1 text-start">{label}</span>
      {typeof badge === "number" && badge > 0 ? (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tnum",
            active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function NavGroup({ label }: { label: string }) {
  return <p className="px-3 pb-1.5 pt-4 text-[11px] font-medium text-muted-foreground/60">{label}</p>;
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const view = useUiStore((s) => s.view);
  const setView = useUiStore((s) => s.setView);
  const account = useUiStore((s) => s.account);
  const status = useAgentStore((s) => s.status);
  const queueCount = useDataStore((s) => s.queue.filter((q) => q.status === "waiting").length);
  const followupsCount = useDataStore(
    (s) =>
      s.followups.filter((f) => f.status === "pending" && new Date(f.dueAt).getTime() <= Date.now() + 86400_000).length
  );
  const meta = agentStatusMeta[status];

  const go = (v: ViewKey) => {
    setView(v);
    onNavigate?.();
  };

  const MAIN: Array<[ViewKey, LucideIcon, string, number | undefined]> = [
    ["dashboard", LayoutDashboard, t("nav.dashboard"), undefined],
    ["calls", PhoneCall, t("nav.calls"), queueCount],
    ["queue", Radio, t("nav.queue"), queueCount],
    ["followups", CalendarClock, t("nav.followups"), followupsCount],
  ];
  const OPS: Array<[ViewKey, LucideIcon, string]> = [
    ["sales", UserCheck, t("nav.sales")],
    ["pipeline", GitBranch, t("nav.pipeline")],
    ["unclaimed", Store, t("nav.unclaimed")],
    ["merge-review", Scale, t("nav.mergeReview")],
    ["bot-queue", BotMessageSquare, t("nav.botQueue")],
    ["whatsapp", MessageCircle, t("nav.whatsapp")],
    ["performance", BarChart3, t("nav.performance")],
    ["audit", ScrollText, t("nav.audit")],
  ];
  const CRM: Array<[ViewKey, LucideIcon, string]> = [
    ["contacts", Users, t("nav.contacts")],
    ["leads", FolderKanban, t("nav.leads")],
    ["campaigns", Headphones, t("nav.campaigns")],
    ["agent", Bot, t("nav.agent")],
    ["knowledge", CircleDot, t("nav.knowledge")],
  ];
  const SYSTEM: Array<[ViewKey, LucideIcon, string]> = [
    ["analytics", BarChart3, t("nav.analytics")],
    ["recordings", AudioLines, t("nav.recordings")],
    ["settings", Settings, t("nav.settings")],
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 pb-2 pt-5">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl">
          <Image src="/voxora.svg" alt="Voxora AI" width={36} height={36} priority className="size-9" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold tracking-tight">Voxora AI</p>
          <p className="truncate text-[11px] text-muted-foreground">{t("app.tagline")}</p>
        </div>
      </div>

      {/* Live agent mini-status */}
      <button
        type="button"
        onClick={() => go("dashboard")}
        className="mx-3 mt-3 flex items-center gap-2.5 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5 text-start transition-colors hover:border-primary/30"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10",
            status !== "offline" && "sc-live-dot text-primary"
          )}
        >
          <Bot className="size-4 text-primary" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{t("dash.liveAgentName")}</span>
          <StatusBadge
            tone={meta.tone}
            label={t(meta.key)}
            live={status !== "offline" && status !== "ready"}
            className="mt-1 max-w-full"
          />
        </span>
      </button>

      {/* Navigation */}
      <nav className="sc-scroll mt-2 flex-1 overflow-y-auto px-3 pb-3" aria-label="Voxora AI">
        <NavGroup label={t("nav.group.main")} />
        {MAIN.map(([v, icon, label, badge]) => (
          <NavItem key={v} v={v} icon={icon} label={label} badge={badge} active={view === v} onSelect={go} />
        ))}
        <NavGroup label={t("nav.group.ops")} />
        {OPS.map(([v, icon, label]) => (
          <NavItem key={v} v={v} icon={icon} label={label} active={view === v} onSelect={go} />
        ))}
        <NavGroup label={t("nav.group.crm")} />
        {CRM.map(([v, icon, label]) => (
          <NavItem key={v} v={v} icon={icon} label={label} active={view === v} onSelect={go} />
        ))}
        <NavGroup label={t("nav.group.system")} />
        {SYSTEM.map(([v, icon, label]) => (
          <NavItem key={v} v={v} icon={icon} label={label} active={view === v} onSelect={go} />
        ))}
      </nav>

      {/* User card */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <button
          type="button"
          onClick={() => go("account")}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition-colors hover:bg-sidebar-accent"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
            {account.name.slice(0, 2)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{account.name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{t(`role.${account.role}`)}</span>
          </span>
          <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        <p className="px-2 pt-1.5 text-[10px] text-muted-foreground/60 tnum">v1.0.0 — {t("app.simulation")}</p>
      </div>
    </div>
  );
}

export function DesktopSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[250px] shrink-0 border-e border-sidebar-border bg-sidebar lg:block">
      <SidebarContent />
    </aside>
  );
}
