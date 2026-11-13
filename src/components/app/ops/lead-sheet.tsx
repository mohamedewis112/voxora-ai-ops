"use client";

/**
 * Voxora AI — lead detail sheet (unified CRM workspace actions).
 * Everything attaches to the SAME lead: outcomes, callbacks, WhatsApp, notes,
 * manual owner linking and documented business-status confirmations.
 * business-status confirmations. Busy/no-answer NEVER change listing visibility.
 */
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock, Link2, MessageCircle, PhoneCall, StickyNote, UserRound,
  ShieldAlert, Building2, BadgeCheck, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { notifyOpsChanged, opsGet, opsPost } from "@/hooks/use-ops";
import { LeadTimeline } from "./lead-timeline";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { LeadDTO, ListingDTO, TimelineEventDTO } from "@/lib/ops-types";

interface LeadDetail {
  lead: LeadDTO;
  timeline: TimelineEventDTO[];
  calls: { id: string; agentType: string; outcome: string; notes: string | null; reason: string | null; durationSec: number; createdAt: string }[];
  followups: { id: string; scheduledAt: string; reason: string; status: string }[];
  listing: ListingDTO | null;
  user: { id: string; fullName: string; isRegistered: boolean; normalizedPhone: string } | null;
  botItem: { id: string; status: string; lastResult: string | null } | null;
}

interface UnclaimedRow {
  id: string;
  businessName: string;
  normalizedPhone: string;
  category: string | null;
  leadId: string | null;
}

const STATUS_TONE: Record<string, string> = {
  new: "bg-zinc-500/15 text-zinc-400", assigned: "bg-zinc-500/15 text-zinc-300",
  queued: "bg-amber-500/15 text-amber-500", calling: "bg-violet-500/15 text-violet-400",
  busy: "bg-amber-500/15 text-amber-500", no_answer: "bg-zinc-500/15 text-zinc-400",
  switched_off: "bg-zinc-500/15 text-zinc-400", invalid_number: "bg-rose-500/15 text-rose-500",
  out_of_service: "bg-rose-500/15 text-rose-500", callback: "bg-violet-500/15 text-violet-400",
  interested: "bg-emerald-500/15 text-emerald-500", not_interested: "bg-rose-500/15 text-rose-500",
  whatsapp_followup: "bg-teal-500/15 text-teal-500", linked: "bg-emerald-500/20 text-emerald-400",
  closed_business: "bg-rose-500/15 text-rose-500", completed: "bg-emerald-500/15 text-emerald-500",
  failed: "bg-rose-500/15 text-rose-500", transferred_to_sales: "bg-amber-500/15 text-amber-500",
};

const OUTCOMES = ["busy", "no_answer", "switched_off", "invalid_number", "out_of_service", "interested", "not_interested"] as const;

function dtLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LeadSheet() {
  const { t } = useI18n();
  const selectedLeadId = useOpsUiStore((s) => s.selectedLeadId);
  const clearLead = useOpsUiStore((s) => s.clearLead);
  const open = !!selectedLeadId;
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // dialog states
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [callbackAt, setCallbackAt] = useState("");
  const [callbackReason, setCallbackReason] = useState("");
  const [waOpen, setWaOpen] = useState(false);
  const [waBody, setWaBody] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkListingId, setLinkListingId] = useState("");
  const [unclaimed, setUnclaimed] = useState<UnclaimedRow[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<"closed_business" | "invalid_phone">("closed_business");
  const [confirmReason, setConfirmReason] = useState("");
  const [confirmConf, setConfirmConf] = useState(90);

  const load = useMemo(
    () => async (id: string) => {
      setLoading(true);
      try {
        const d = await opsGet<LeadDetail>(`leads/${id}/detail`);
        setDetail(d);
      } catch {
        toast.error(t("ops.errorLoad"));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  const onOpenChange = (o: boolean) => {
    if (!o) {
      clearLead();
      setDetail(null);
    }
  };

  // Load whenever the selected lead changes (programmatic open via row clicks).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (selectedLeadId) void load(selectedLeadId);
      else setDetail(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedLeadId, load]);

  const act = async (fn: () => Promise<unknown>, successKey?: string) => {
    if (!selectedLeadId) return;
    setBusy(true);
    try {
      await fn();
      if (successKey) toast.success(t(successKey));
      await load(selectedLeadId);
      notifyOpsChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  };

  const lead = detail?.lead;

  const openLinkDialog = async () => {
    setLinkOpen(true);
    try {
      if (!lead?.id) return;
      const rows = await opsGet<UnclaimedRow[]>(`leads/${lead.id}/link-candidates`);
      setUnclaimed(rows.slice(0, 30));
    } catch {
      setUnclaimed([]);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined} side="left" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]" dir="rtl">
        <SheetHeader className="border-b border-border/60 px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-lg">
                {loading && !lead ? t("ops.loading") : lead?.businessName || lead?.customerName || lead?.normalizedPhone}
              </SheetTitle>
              {lead ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">{lead.normalizedPhone}</span>
                  {lead.prefix && <Badge variant="outline" className="tnum">{lead.prefix}</Badge>}
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONE[lead.status] ?? "bg-muted")}>
                    {t(`sales.outcome.${lead.status}`) !== `sales.outcome.${lead.status}` ? t(`sales.outcome.${lead.status}`) : lead.status}
                  </span>
                  {detail?.user?.isRegistered && (
                    <Badge className="bg-emerald-500/15 text-emerald-400" variant="secondary">
                      <BadgeCheck className="me-1 size-3" /> {t("ops.registered")}
                    </Badge>
                  )}
                </div>
              ) : null}
            </div>
            {lead?.agentName && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 py-1.5 text-xs text-muted-foreground">
                <UserRound className="size-3.5" aria-hidden="true" />
                {lead.agentName}
              </span>
            )}
          </div>
        </SheetHeader>

        {lead && (
          <>
            {/* Primary actions */}
            <div className="flex flex-wrap gap-2 border-b border-border/60 px-5 py-3">
              <Select
                value=""
                onValueChange={(v) => {
                  if (!v) return;
                  act(
                    () => opsPost(`leads/${lead.id}/outcome`, { outcome: v, notes: "" }),
                    "sales.markOutcomeToast"
                  );
                }}
                disabled={busy}
              >
                <SelectTrigger className="h-8 w-[170px]" aria-label={t("sales.logCall")}>
                  <PhoneCall className="size-3.5 text-primary" aria-hidden="true" />
                  <SelectValue placeholder={t("sales.logCall")} />
                </SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>{t(`sales.outcome.${o}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button size="sm" variant="outline" className="h-8" onClick={() => setCallbackOpen(true)} disabled={busy}>
                <CalendarClock className="size-3.5" aria-hidden="true" /> {t("sales.scheduleCallback")}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => setWaOpen(true)} disabled={busy}>
                <MessageCircle className="size-3.5" aria-hidden="true" /> {t("sales.sendWhatsapp")}
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={openLinkDialog} disabled={busy}>
                <Link2 className="size-3.5" aria-hidden="true" /> {t("sales.linkOwner")}
              </Button>
              {lead.listingId && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                  onClick={() => setConfirmOpen(true)}
                  disabled={busy}
                >
                  <ShieldAlert className="size-3.5" aria-hidden="true" /> {t("sales.confirmBusinessStatus")}
                </Button>
              )}
            </div>

            {/* Body */}
            <Tabs defaultValue="timeline" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="mx-5 mt-3 grid w-auto grid-cols-3">
                <TabsTrigger value="timeline">{t("sales.leadTimeline")}</TabsTrigger>
                <TabsTrigger value="calls">{t("sales.callsHistory")}</TabsTrigger>
                <TabsTrigger value="listing">{t("ops.business")}</TabsTrigger>
              </TabsList>

              <TabsContent value="timeline" className="min-h-0 flex-1 px-5 pb-5">
                <ScrollArea className="h-[calc(100vh-320px)] pe-2 sc-scroll">
                  <div className="pt-2">
                    {/* quick note composer */}
                    <div className="mb-4 rounded-lg border border-border/70 p-3">
                      <Label className="text-xs text-muted-foreground">{t("sales.addNote")}</Label>
                      <div className="mt-2 flex gap-2">
                        <Textarea
                          value={noteBody}
                          onChange={(e) => setNoteBody(e.target.value)}
                          placeholder={t("sales.notePlaceholder")}
                          className="min-h-[60px] flex-1 text-sm"
                        />
                        <Button
                          size="icon"
                          className="size-8 shrink-0 self-end"
                          disabled={busy || !noteBody.trim()}
                          onClick={() => {
                            const body = noteBody;
                            setNoteBody("");
                            act(() => opsPost(`leads/${lead.id}/notes`, { body }), "toast.saved");
                          }}
                          aria-label={t("sales.addNote")}
                        >
                          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <StickyNote className="size-3.5" />}
                        </Button>
                      </div>
                    </div>
                    <LeadTimeline events={detail?.timeline ?? []} />
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="calls" className="min-h-0 flex-1 px-5 pb-5">
                <ScrollArea className="h-[calc(100vh-320px)] pe-2 sc-scroll">
                  <div className="space-y-2 pt-2">
                    {(detail?.calls ?? []).length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
                    )}
                    {(detail?.calls ?? []).map((c) => (
                      <div key={c.id} className="rounded-lg border border-border/70 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{t(`sales.outcome.${c.outcome}`) !== `sales.outcome.${c.outcome}` ? t(`sales.outcome.${c.outcome}`) : c.outcome}</span>
                          <span className="text-[11px] text-muted-foreground tnum">{detail ? new Date(c.createdAt).toLocaleString("ar-EG") : ""}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{t(`sales.actor.${c.agentType}`)}</Badge>
                          {c.durationSec > 0 && <span className="tnum">{c.durationSec} ث</span>}
                        </div>
                        {(c.notes || c.reason) && (
                          <p className="mt-1.5 text-xs text-muted-foreground">{c.notes || c.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="listing" className="min-h-0 flex-1 px-5 pb-5">
                <ScrollArea className="h-[calc(100vh-320px)] pe-2 sc-scroll">
                  <div className="space-y-3 pt-2 text-sm">
                    {detail?.listing ? (
                      <>
                        <div className="rounded-lg border border-border/70 p-3">
                          <p className="flex items-center gap-2 font-medium">
                            <Building2 className="size-4 text-primary" aria-hidden="true" />
                            {detail.listing.businessName}
                          </p>
                          <dl className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                            <div className="flex justify-between gap-3"><dt>{t("ops.phone")}</dt><dd dir="ltr" className="tnum">{detail.listing.normalizedPhone}</dd></div>
                            {detail.listing.category && <div className="flex justify-between gap-3"><dt>{t("unclaimed.category")}</dt><dd>{detail.listing.category}</dd></div>}
                            {detail.listing.governorate && <div className="flex justify-between gap-3"><dt>{t("unclaimed.location")}</dt><dd>{[detail.listing.governorate, detail.listing.city, detail.listing.village].filter(Boolean).join(" — ")}</dd></div>}
                            {detail.listing.address && <div className="flex justify-between gap-3"><dt>{t("merge.fieldAddress") ?? "العنوان"}</dt><dd>{detail.listing.address}</dd></div>}
                            <div className="flex justify-between gap-3"><dt>{t("ops.status")}</dt><dd>{detail.listing.status}</dd></div>
                          </dl>
                        </div>
                        {detail.listing.description && (
                          <div className="rounded-lg border border-border/70 p-3 text-xs leading-relaxed text-muted-foreground">
                            {detail.listing.description}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="py-8 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
                    )}
                    {detail?.followups && detail.followups.length > 0 && (
                      <>
                        <Separator />
                        <div className="rounded-lg border border-border/70 p-3">
                          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                            <CalendarClock className="size-4 text-violet-400" aria-hidden="true" />
                            {t("sales.callbacks")}
                          </p>
                          <ul className="space-y-1.5 text-xs text-muted-foreground">
                            {detail.followups.map((f) => (
                              <li key={f.id} className="flex items-center justify-between gap-2">
                                <span>{f.reason}</span>
                                <span className="tnum">{detail ? new Date(f.scheduledAt).toLocaleString("ar-EG") : ""}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </>
        )}

        {/* ---- Callback dialog ---- */}
        <Dialog open={callbackOpen} onOpenChange={setCallbackOpen}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>{t("sales.scheduleCallback")}</DialogTitle>
              <DialogDescription>{t("sales.visibilityNote")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("sales.callbackDate")}</Label>
                <Input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>{t("sales.callbackReason")}</Label>
                <Input value={callbackReason} onChange={(e) => setCallbackReason(e.target.value)} className="mt-1.5" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCallbackOpen(false)}>{t("ops.cancel")}</Button>
              <Button
                disabled={!callbackAt || busy}
                onClick={() => {
                  setCallbackOpen(false);
                  act(
                    () => opsPost(`leads/${lead!.id}/callback`, { scheduledAt: new Date(callbackAt).toISOString(), reason: callbackReason }),
                    "sales.markOutcomeToast"
                  );
                }}
              >
                {t("ops.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---- WhatsApp follow-up ---- */}
        <Dialog open={waOpen} onOpenChange={setWaOpen}>
          <DialogContent className="sm:max-w-[440px]">
            <DialogHeader>
              <DialogTitle>{t("sales.sendWhatsapp")}</DialogTitle>
              <DialogDescription>{t("wa.desc")}</DialogDescription>
            </DialogHeader>
            <Textarea
              value={waBody}
              onChange={(e) => setWaBody(e.target.value)}
              placeholder={t("sales.whatsappBody")}
              className="min-h-[100px]"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setWaOpen(false)}>{t("ops.cancel")}</Button>
              <Button
                disabled={!waBody.trim() || busy}
                onClick={() => {
                  const body = waBody;
                  const digits = lead!.normalizedPhone.replace(/\D/g, "");
                  const waNumber = digits.startsWith("0") ? `20${digits.slice(1)}` : digits;
                  window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
                  setWaBody("");
                  setWaOpen(false);
                  act(() => opsPost(`leads/${lead!.id}/whatsapp-followup`, { body }), "wa.sentToast");
                }}
              >
                {t("wa.send")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---- Link owner ---- */}
        <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
          <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
              <DialogTitle>{t("sales.linkOwner")}</DialogTitle>
              <DialogDescription>{t("sales.linkOwnerDesc")}</DialogDescription>
            </DialogHeader>
            <div className="sc-scroll max-h-[50vh] space-y-2 overflow-y-auto">
              {unclaimed.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setLinkListingId(r.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-start text-sm transition-colors",
                    linkListingId === r.id ? "border-primary/60 bg-primary/5" : "border-border/70 hover:border-primary/30"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.businessName}</span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">{r.normalizedPhone}</span>
                  </span>
                  {r.category && <Badge variant="outline" className="shrink-0">{r.category}</Badge>}
                </button>
              ))}
              {unclaimed.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setLinkOpen(false)}>{t("ops.cancel")}</Button>
              <Button
                disabled={!linkListingId || busy}
                onClick={() => {
                  setLinkOpen(false);
                  act(
                    () => opsPost(`leads/${lead!.id}/link-owner`, { listingId: linkListingId, userId: null, reason: "ربط يدوي بواسطة المبيعات" }),
                    "unclaimed.linkedToast"
                  );
                }}
              >
                {t("sales.linkOwner")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---- Confirm business status (documented, restorable) ---- */}
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle>{t("sales.confirmBusinessStatus")}</DialogTitle>
              <DialogDescription>{t("sales.visibilityNote")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Select value={confirmStatus} onValueChange={(v) => setConfirmStatus(v as "closed_business" | "invalid_phone")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="closed_business">{t("sales.confirmClosed")}</SelectItem>
                  <SelectItem value="invalid_phone">{t("sales.confirmInvalidPhone")}</SelectItem>
                </SelectContent>
              </Select>
              <div>
                <Label>{t("sales.reasonLabel")}</Label>
                <Input value={confirmReason} onChange={(e) => setConfirmReason(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label>{t("sales.confidence")}</Label>
                <Input
                  type="number" min={70} max={100}
                  value={confirmConf}
                  onChange={(e) => setConfirmConf(Number(e.target.value))}
                  className="mt-1.5 tnum"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">≥ 70</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmOpen(false)}>{t("ops.cancel")}</Button>
              <Button
                variant="destructive"
                disabled={confirmConf < 70 || !confirmReason.trim() || busy}
                onClick={() => {
                  setConfirmOpen(false);
                  act(
                    () => opsPost(`leads/${lead!.id}/confirm-business-status`, {
                      status: confirmStatus, reason: confirmReason, confidence: confirmConf,
                    }),
                    "sales.markOutcomeToast"
                  );
                }}
              >
                {t("ops.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
