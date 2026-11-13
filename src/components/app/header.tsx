"use client";

/**
 * Top app bar: mobile drawer trigger, global search, notifications,
 * theme + language toggles and the account menu.
 */

import { useState } from "react";
import {
  Bell,
  CalendarClock,
  Languages,
  LogOut,
  Menu,
  Moon,
  PhoneCall,
  Search,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useDataStore } from "@/stores/data-store";
import { useUiStore, type ViewKey } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarContent } from "./sidebar";
import { cn } from "@/lib/utils";
import { useOps } from "@/hooks/use-ops";
import { BadgeCheck, CalendarClock as CalIcon, PhoneCall as PhoneIcon, Sparkles } from "lucide-react";

interface OpsNotif {
  id: string;
  title: string;
  body: string;
  type: string;
  leadId: string | null;
  read: boolean;
  createdAt: string;
}

const NOTIF_ICON: Record<string, typeof Sparkles> = {
  success: BadgeCheck,
  info: Sparkles,
  warning: CalIcon,
  error: PhoneIcon,
};

export function Header() {
  const { t, lang, setLang, dir } = useI18n();
  const { theme, setTheme } = useTheme();
  const { view, setView, account, logout, setCallsSearch, setContactsSearch } = useUiStore();
  const followups = useDataStore((s) => s.followups);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { data: opsNotifs } = useOps<OpsNotif[]>("notifications", undefined, { pollMs: 30000 });

  const now = Date.now();
  const alerts = followups
    .filter((f) => f.status === "pending")
    .map((f) => ({ ...f, overdue: new Date(f.dueAt).getTime() < now }))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 6);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (/^\d+$/.test(q)) {
      setCallsSearch(q);
      setView("calls");
    } else {
      setContactsSearch(q);
      setView("contacts");
    }
  };

  const notificationsNode = (
    <PopoverContent align="end" className="w-80 p-0">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">{t("common.notifications")}</div>
      {/* Voxora ops notifications (leads, merges, ownership links, bot) */}
      {(opsNotifs ?? []).length > 0 && (
        <div className="sc-scroll max-h-52 overflow-y-auto border-b border-border/70 p-2">
          {(opsNotifs ?? []).slice(0, 5).map((n) => {
            const Icon = NOTIF_ICON[n.type] ?? Sparkles;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  setView(n.leadId ? "sales" : "pipeline");
                }}
                className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-accent"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                    n.type === "success"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : n.type === "warning"
                        ? "bg-amber-500/10 text-amber-500"
                        : "bg-violet-500/10 text-violet-400"
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium">{n.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                </span>
                {!n.read && <span className="ms-auto mt-1 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-label="unread" />}
              </button>
            );
          })}
        </div>
      )}
      <div className="px-4 py-2 text-[11px] font-medium text-muted-foreground/70">{t("follow.title")}</div>
      <div className="sc-scroll max-h-72 overflow-y-auto p-2">
        {alerts.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t("common.noNotifications")}</p>
        ) : (
          alerts.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                setView("followups");
              }}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-start transition-colors hover:bg-accent"
            >
              <span className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                f.overdue ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"
              )}>
                <CalendarClock className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{f.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{f.reason}</span>
              </span>
              {f.overdue ? (
                <span className="ms-auto shrink-0 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-500">
                  {t("follow.overdue")}
                </span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </PopoverContent>
  );

  return (
    <header className="glass sticky top-0 z-30 border-b border-border/70">
      <div className="flex h-14 items-center gap-2 px-3 md:px-5">
        {/* Mobile drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("nav.dashboard")}>
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent aria-describedby={undefined}
            side={dir === "rtl" ? "right" : "left"}
            className="w-[280px] border-sidebar-border bg-sidebar p-0"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{t("nav.dashboard")}</SheetTitle>
            </SheetHeader>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>

        {/* Page title (mobile) */}
        <p className="truncate text-sm font-semibold lg:hidden">
          {t(`nav.${view === "account" ? "settings" : view === "queue" ? "queue" : view}`)}
        </p>

        {/* Global search (desktop) */}
        <form onSubmit={submitSearch} className="relative hidden w-full max-w-sm md:block">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.searchPlaceholder")}
            className="h-9 rounded-lg bg-background/60 ps-9 text-sm"
            aria-label={t("common.search")}
          />
        </form>

        <div className="ms-auto flex items-center gap-1.5">
          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label={t("common.notifications")}>
                <Bell className="size-[18px]" />
                {(opsNotifs ?? []).some((n) => !n.read) || alerts.some((a) => a.overdue) ? (
                  <span className="absolute end-2 top-2 size-1.5 rounded-full bg-rose-500 sc-live-dot" aria-hidden="true" />
                ) : null}
              </Button>
            </PopoverTrigger>
            {notificationsNode}
          </Popover>

          {/* Language toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLang(lang === "ar" ? "en" : "ar")}
            className="h-9 gap-1.5 px-2.5 text-xs font-semibold"
            aria-label={t("app.lang")}
          >
            <Languages className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("app.lang")}
          </Button>

          {/* Theme toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={t("common.theme")}
          >
            <Sun className="size-[18px] dark:hidden" />
            <Moon className="hidden size-[18px] dark:block" />
          </Button>

          {/* Account */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="ms-1 flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary transition-transform hover:scale-105"
                aria-label={t("common.account")}
              >
                {account.name.slice(0, 2)}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>
                <p className="text-sm font-medium">{account.name}</p>
                <p className="truncate text-xs font-normal text-muted-foreground">{account.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setView("account")}>
                <UserRound className="size-4" /> {t("common.account")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  if (process.env.NEXT_PUBLIC_DALEELY_ADAPTER === "supabase") {
                    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
                  }
                  logout();
                  toast.info(t("common.logout"));
                }}
              >
                <LogOut className="size-4" /> {t("common.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

/** Footer — sticks to the bottom via mt-auto in the shell. */
export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mt-auto border-t border-border/60 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <p>© {new Date().getFullYear()} Voxora AI — {t("app.footerRights")}</p>
        <p className="inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500 sc-live-dot" aria-hidden="true" />
          {process.env.NEXT_PUBLIC_DALEELY_ADAPTER === "supabase" ? "متصل بقاعدة التشغيل" : `${t("app.connected")} ${t("app.mockProvider")}`}
        </p>
      </div>
    </footer>
  );
}

export function viewTitleKey(view: ViewKey): string {
  if (view === "queue") return "nav.queue";
  if (view === "account") return "common.account";
  return `nav.${view}`;
}

export function QuickNavChip({ view, label }: { view: ViewKey; label: string }) {
  const setView = useUiStore((s) => s.setView);
  return (
    <button
      type="button"
      onClick={() => setView(view)}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <PhoneCall className="size-3" aria-hidden="true" />
      {label}
    </button>
  );
}
