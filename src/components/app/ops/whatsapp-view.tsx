"use client";

/**
 * Voxora AI — WhatsApp inbox (واتساب).
 *
 * Two-pane messenger layout: threads list on the inline-start side, the open
 * conversation on the inline-end side (single pane + back navigation on
 * mobile). Data comes from the ops API (`/api/ops/whatsapp/*`) with polling;
 * the server advances simulated message statuses on every GET, so the open
 * conversation polls a little faster to watch ticks progress. Threads share
 * the same lead records as the sales workspace — the linked-lead chip jumps
 * straight into it via useOpsUiStore.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  MessageSquare,
  MessagesSquare,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n, type Lang } from "@/lib/i18n";
import { notifyOpsChanged, onOpsChanged, opsPost, useOps } from "@/hooks/use-ops";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { useUiStore } from "@/stores/ui-store";
import type { LeadDTO, WhatsAppMessageDTO, WhatsAppThreadDTO } from "@/lib/ops-types";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/shared/page-header";
import { EmptyState } from "@/components/app/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/* ------------------------------- constants ------------------------------- */

/** Arabic quick replies — demo templates, intentionally kept as literals. */
const TEMPLATES: readonly string[] = [
  "أهلًا، معك فريق دليلي — عايزين نحدث بيانات نشاطك على المنصة",
  "تحب نبعتلك عرض الباقات والأسعار؟",
  "تم تحديث نشاطك بنجاح — شكرًا لتعاونك",
];

/** GET whatsapp/threads/:id → { thread, messages } */
interface WhatsAppThreadDetailDTO {
  thread: WhatsAppThreadDTO;
  messages: WhatsAppMessageDTO[];
}

/** Tick appearance per WhatsApp status (emerald = read, rose = failed). */
const STATUS_META: Record<string, { icon: LucideIcon; cls: string; key: string }> = {
  queued: { icon: Clock, cls: "text-muted-foreground", key: "wa.status.queued" },
  sent: { icon: Check, cls: "text-muted-foreground", key: "wa.status.sent" },
  delivered: { icon: CheckCheck, cls: "text-muted-foreground", key: "wa.status.delivered" },
  read: { icon: CheckCheck, cls: "text-emerald-600 dark:text-emerald-400", key: "wa.status.read" },
  failed: { icon: X, cls: "text-rose-500", key: "wa.status.failed" },
  received: { icon: ArrowDownLeft, cls: "text-muted-foreground", key: "wa.status.received" },
};

/* -------------------------------- helpers -------------------------------- */

/** Compact relative time ("قبل 5 دقائق" / "5 minutes ago"), short date fallback. */
function relTime(iso: string | null, lang: Lang): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en", { numeric: "auto" });
  const diffMin = Math.round((Date.now() - then) / 60_000);
  if (diffMin < 1) return rtf.format(0, "minute");
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return rtf.format(-diffH, "hour");
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return rtf.format(-diffD, "day");
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
  }).format(then);
}

/** Up to two letters from the display name for the avatar circle. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

function InitialsAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-semibold text-emerald-700 dark:text-emerald-300",
        className
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/* ------------------------------ threads pane ------------------------------ */

/**
 * Inline-start pane. NOTE: the parent keys this component by the committed
 * search query — remounting per query keeps the poller's fetch closure in
 * sync with `?q=` (the shared hook's interval captures its first closure).
 */
function ThreadsPane({
  q,
  search,
  onSearchChange,
  activeId,
  onSelect,
}: {
  q: string;
  search: string;
  onSearchChange: (v: string) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, lang } = useI18n();
  const { data, loading, error, refresh } = useOps<WhatsAppThreadDTO[]>(
    "whatsapp/threads",
    { q: q || undefined },
    { pollMs: 6000 }
  );

  /* Send/simulate in the conversation pane → silent refetch of previews. */
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useEffect(() => onOpsChanged(() => refreshRef.current()), []);

  const rows = data ?? [];

  return (
    <div className="border-b border-border/60 lg:border-b-0 lg:border-e">
      <div className="relative p-3">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("ops.searchPhoneOrName")}
          aria-label={t("ops.search")}
          className="ps-9"
        />
      </div>

      <div className="sc-scroll max-h-[420px] overflow-y-auto p-2 sm:max-h-[480px] lg:max-h-[540px]">
        {loading && rows.length === 0 ? (
          <div className="space-y-2" aria-busy="true" aria-live="polite">
            <span className="sr-only">{t("ops.loading")}</span>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg p-2">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error && rows.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title={t("ops.errorLoad")}
            desc={error}
            action={
              <Button variant="outline" size="sm" onClick={() => refresh()}>
                <RefreshCw className="size-4" />
                {t("ops.retry")}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState icon={MessageSquare} title={t("wa.empty")} />
        ) : (
          <ul className="space-y-1" aria-label={t("wa.threads")}>
            {rows.map((th) => {
              const active = th.id === activeId;
              const meta = th.lastMessageStatus ? STATUS_META[th.lastMessageStatus] : undefined;
              const Tick = meta?.icon;
              return (
                <li key={th.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(th.id)}
                    aria-current={active || undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg p-2 text-start transition-colors",
                      active ? "bg-emerald-500/10" : "hover:bg-muted/60"
                    )}
                  >
                    <InitialsAvatar name={th.displayName} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          active && "text-emerald-800 dark:text-emerald-200"
                        )}
                      >
                        {th.displayName}
                      </p>
                      {th.lastMessagePreview ? (
                        <p className="line-clamp-1 text-xs text-muted-foreground">{th.lastMessagePreview}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] leading-none text-muted-foreground tnum">
                        {relTime(th.lastMessageAt, lang)}
                      </span>
                      <span className="flex h-5 items-center gap-1">
                        {Tick ? (
                          <span className="flex" title={meta ? t(meta.key) : undefined}>
                            <Tick className={cn("size-3.5", meta?.cls)} aria-hidden="true" />
                          </span>
                        ) : null}
                        {th.unreadCount > 0 ? (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold leading-none text-white tnum">
                            {th.unreadCount}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- message bubble ----------------------------- */

function MessageBubble({ msg }: { msg: WhatsAppMessageDTO }) {
  const { t, fmtTime } = useI18n();
  const out = msg.direction === "out";
  const meta = out ? STATUS_META[msg.status] : undefined;
  const StatusIcon = meta?.icon;

  return (
    <div className={cn("flex flex-col gap-0.5", out ? "items-end" : "items-start")}>
      {/* AI-sent outgoing messages get a small actor tag (sales.actor.*). */}
      {out && msg.actorType === "ai_agent" ? (
        <span className="px-1 text-[10px] text-violet-700 dark:text-violet-300">
          {t("sales.actor.ai_agent")}
        </span>
      ) : null}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-xs md:max-w-[72%]",
          out ? "rounded-ee-sm bg-primary/15" : "rounded-se-sm bg-muted"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        <span className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-muted-foreground tnum">
          <time dateTime={msg.createdAt}>{fmtTime(msg.createdAt)}</time>
          {StatusIcon ? (
            <span
              className="flex"
              title={meta ? t(meta.key) : undefined}
              aria-label={meta ? t(meta.key) : undefined}
            >
              <StatusIcon className={cn("size-3", meta?.cls)} aria-hidden="true" />
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------- view ---------------------------------- */

export function WhatsAppView() {
  const { t, lang, dir } = useI18n();
  const setView = useUiStore((s) => s.setView);
  const selectLead = useOpsUiStore((s) => s.selectLead);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [simulating, setSimulating] = useState(false);

  /* Committed (debounced) search feeds the threads query via ?q=. */
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(id);
  }, [search]);

  const detail = useOps<WhatsAppThreadDetailDTO>(
    activeId ? `whatsapp/threads/${activeId}` : null,
    undefined,
    { pollMs: 4000 }
  );

  /* Ignore stale detail data while switching threads. */
  const detailData = detail.data && detail.data.thread.id === activeId ? detail.data : null;
  const messages = detailData?.messages ?? [];
  const lead = detailData?.thread.lead ?? null;

  /* Auto-scroll the conversation to the latest message. */
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const threadKey = detailData?.thread.id ?? null;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight });
  }, [threadKey, messages.length]);

  const selectThread = (id: string) => {
    if (id !== activeId) {
      setActiveId(id);
      setDraft("");
    }
    setMobilePane("chat");
    notifyOpsChanged(); // opening the thread clears its unread count server-side
  };

  const openLead = (l: LeadDTO) => {
    selectLead(l.id);
    setView("sales");
  };

  const onSend = async (): Promise<void> => {
    const body = draft.trim();
    if (!activeId || !body || sending) return;
    setSending(true);
    try {
      const isTemplate = TEMPLATES.includes(body);
      await opsPost(`whatsapp/threads/${activeId}/send`, isTemplate ? { body, template: body } : { body });
      setDraft("");
      detail.refresh();
      notifyOpsChanged();
      toast.success(t("wa.sentToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const onSimulateReply = async (): Promise<void> => {
    if (!activeId || simulating) return;
    setSimulating(true);
    try {
      await opsPost(`whatsapp/threads/${activeId}/simulate-reply`, {});
      detail.refresh();
      notifyOpsChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSimulating(false);
    }
  };

  /* Enter sends, Shift+Enter inserts a newline. */
  const onDraftKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  };

  /* RTL back arrow: points right in Arabic, left in English. */
  const BackIcon = dir === "rtl" ? ArrowRight : ArrowLeft;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("wa.title")}
        desc={t("wa.desc")}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {t("ops.demoMode")}
          </span>
        }
      />

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="grid lg:grid-cols-[320px_1fr]">
          {/* Inline-start pane — threads list */}
          <section
            aria-label={t("wa.threads")}
            className={cn("min-w-0", mobilePane === "chat" && "hidden lg:block")}
          >
            <ThreadsPane
              key={q}
              q={q}
              search={search}
              onSearchChange={setSearch}
              activeId={activeId}
              onSelect={selectThread}
            />
          </section>

          {/* Inline-end pane — conversation */}
          <section
            aria-label={detailData ? detailData.thread.displayName : t("wa.title")}
            className={cn("flex min-w-0 flex-col", mobilePane === "list" && "hidden lg:flex")}
          >
            {!activeId ? (
              <div className="flex min-h-[360px] items-center justify-center p-6">
                <EmptyState icon={MessagesSquare} title={t("wa.selectThread")} />
              </div>
            ) : detailData ? (
              <>
                {/* Conversation header */}
                <header className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2.5 md:px-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label={t("wa.threads")}
                    onClick={() => setMobilePane("list")}
                  >
                    <BackIcon className="size-4" aria-hidden="true" />
                  </Button>
                  <InitialsAvatar name={detailData.thread.displayName} />
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="truncate text-sm font-semibold">{detailData.thread.displayName}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span dir="ltr" className="tnum">
                        {detailData.thread.phoneNormalized}
                      </span>
                      {lead?.agentName ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <UserRound className="size-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {t("wa.salesOwner")}: {lead.agentName}
                          </span>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {lead ? (
                    <button
                      type="button"
                      onClick={() => openLead(lead)}
                      title={t("wa.linkedLead")}
                      className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs text-emerald-800 transition-colors hover:bg-emerald-500/20 dark:text-emerald-300"
                    >
                      <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                      <span className="max-w-[140px] truncate font-medium">
                        {lead.businessName || lead.customerName}
                      </span>
                      <span className="hidden shrink-0 text-emerald-700/70 sm:inline dark:text-emerald-300/70">
                        · {t("wa.linkedLead")}
                      </span>
                    </button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void onSimulateReply()}
                    disabled={simulating}
                    aria-busy={simulating}
                  >
                    {simulating ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="size-4" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">{t("wa.simulateReply")}</span>
                  </Button>
                </header>

                {/* Messages */}
                <div
                  ref={scrollRef}
                  role="log"
                  aria-label={t("wa.threads")}
                  aria-busy={detail.loading && messages.length === 0}
                  className="sc-scroll flex max-h-[420px] min-h-[260px] flex-col gap-2 overflow-y-auto bg-muted/20 p-3 sm:max-h-[480px] md:max-h-[520px] md:p-4"
                >
                  {messages.map((m) => (
                    <MessageBubble key={m.id} msg={m} />
                  ))}
                </div>

                {/* Composer */}
                <form
                  className="flex items-end gap-2 border-t border-border/60 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onSend();
                  }}
                >
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onDraftKeyDown}
                    placeholder={t("wa.writeMessage")}
                    aria-label={t("wa.writeMessage")}
                    disabled={sending}
                    className="max-h-40 min-h-11 resize-none py-2.5 text-sm"
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        aria-label={t("wa.templates")}
                        title={t("wa.templates")}
                      >
                        <MessagesSquare className="size-4" aria-hidden="true" />
                        <span className="hidden md:inline">{t("wa.templates")}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-80">
                      <DropdownMenuLabel>{t("wa.templates")}</DropdownMenuLabel>
                      {TEMPLATES.map((tpl) => (
                        <DropdownMenuItem
                          key={tpl}
                          onClick={() => setDraft(tpl)}
                          className="whitespace-normal text-[13px] leading-relaxed"
                        >
                          {tpl}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="submit"
                    size="sm"
                    className="shrink-0"
                    disabled={sending || !draft.trim()}
                    aria-busy={sending}
                    aria-label={t("wa.send")}
                  >
                    {sending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )}
                    <span className="hidden md:inline">{t("wa.send")}</span>
                  </Button>
                </form>
              </>
            ) : detail.error ? (
              <div className="flex min-h-[360px] items-center justify-center p-6">
                <EmptyState
                  icon={AlertTriangle}
                  title={t("ops.errorLoad")}
                  desc={detail.error}
                  action={
                    <Button variant="outline" size="sm" onClick={() => detail.refresh()}>
                      <RefreshCw className="size-4" />
                      {t("ops.retry")}
                    </Button>
                  }
                />
              </div>
            ) : (
              /* Thread selected, detail loading */
              <div className="flex min-h-[360px] flex-col" aria-busy="true">
                <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="flex flex-1 flex-col justify-end gap-2 p-3 md:p-4">
                  <span className="sr-only">{t("ops.loading")}</span>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                      <Skeleton
                        className={cn("h-10 w-2/3 rounded-2xl", i % 2 === 0 ? "rounded-se-sm" : "rounded-ee-sm")}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
