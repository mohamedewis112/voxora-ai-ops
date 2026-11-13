"use client";

import Image from "next/image";
import {
  BarChart3,
  CalendarClock,
  GitBranch,
  MessageCircle,
  Scale,
  ScrollText,
  Settings,
  Store,
  UserRound,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useUiStore, type ViewKey } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

function NavItem({
  v,
  icon: Icon,
  label,
  active,
  onSelect,
}: {
  v: ViewKey;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onSelect: (v: ViewKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(v)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} aria-hidden="true" />
      <span className="flex-1 text-start">{label}</span>
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
  const isSales = account.role === "sales_agent";

  const go = (v: ViewKey) => {
    setView(v);
    onNavigate?.();
  };

  const SALES: Array<[ViewKey, LucideIcon, string]> = [
    ["sales", UserCheck, "عملائي"],
    ["followups", CalendarClock, t("nav.followups")],
    ["whatsapp", MessageCircle, t("nav.whatsapp")],
  ];

  const ADMIN: Array<[ViewKey, LucideIcon, string]> = [
    ["sales", UserCheck, t("nav.sales")],
    ["pipeline", GitBranch, t("nav.pipeline")],
    ["unclaimed", Store, t("nav.unclaimed")],
    ["merge-review", Scale, t("nav.mergeReview")],
    ["whatsapp", MessageCircle, t("nav.whatsapp")],
    ["performance", BarChart3, t("nav.performance")],
    ["audit", ScrollText, t("nav.audit")],
    ["followups", CalendarClock, t("nav.followups")],
    ["settings", Settings, t("nav.settings")],
  ];

  const items = isSales ? SALES : ADMIN;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pb-2 pt-5">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl">
          <Image src="/voxora.svg" alt="Voxora" width={36} height={36} priority className="size-9" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold tracking-tight">Voxora Sales</p>
          <p className="truncate text-[11px] text-muted-foreground">إدارة المبيعات ومتابعة العملاء</p>
        </div>
      </div>

      <nav className="sc-scroll mt-2 flex-1 overflow-y-auto px-3 pb-3" aria-label="Voxora Sales">
        <NavGroup label={isSales ? "مساحة عملي" : "إدارة المبيعات"} />
        {items.map(([v, icon, label]) => (
          <NavItem key={v} v={v} icon={icon} label={label} active={view === v} onSelect={go} />
        ))}
      </nav>

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
        <p className="px-2 pt-1.5 text-[10px] text-muted-foreground/60">Voxora Sales — تشغيل فعلي</p>
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
