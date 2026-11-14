"use client";

import { useEffect, useState } from "react";
import { Building2, CalendarClock, Loader2, Phone, UserRound } from "lucide-react";
import { opsGet } from "@/hooks/use-ops";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LeadTimeline } from "./lead-timeline";
import type { LeadDTO, ListingDTO, TimelineEventDTO } from "@/lib/ops-types";

interface LeadDetail {
  lead: LeadDTO;
  timeline: TimelineEventDTO[];
  calls: { id: string; outcome: string; notes: string | null; reason: string | null; createdAt: string }[];
  followups: { id: string; scheduledAt: string; reason: string; status: string }[];
  listing: ListingDTO | null;
  user: { id: string; fullName: string; isRegistered: boolean; normalizedPhone: string } | null;
}

export function ManagerLeadSheet() {
  const selectedLeadId = useOpsUiStore((s) => s.selectedLeadId);
  const clearLead = useOpsUiStore((s) => s.clearLead);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedLeadId) return;
    let active = true;
    setLoading(true);
    opsGet<LeadDetail>(`leads/${selectedLeadId}/detail`)
      .then((d) => { if (active) setDetail(d); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedLeadId]);

  const lead = detail?.lead;

  return (
    <Sheet open={!!selectedLeadId} onOpenChange={(open) => {
      if (!open) {
        clearLead();
        setDetail(null);
      }
    }}>
      <SheetContent className="w-full overflow-hidden sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>تفاصيل العميل</SheetTitle>
        </SheetHeader>
        {loading && !detail ? (
          <div className="flex h-60 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : !detail || !lead ? (
          <p className="py-10 text-center text-sm text-muted-foreground">تعذر تحميل العميل.</p>
        ) : (
          <ScrollArea className="mt-4 h-[calc(100vh-90px)] pe-3">
            <div className="space-y-5 pb-8">
              <div>
                <p className="text-lg font-bold">{lead.businessName || lead.customerName || lead.normalizedPhone}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{lead.agentName || "غير مسند"}</Badge>
                  <Badge variant="outline">{lead.status}</Badge>
                  {lead.prefix && <Badge variant="outline">{lead.prefix}</Badge>}
                </div>
              </div>

              <Separator />

              <div className="grid gap-3 sm:grid-cols-2">
                <Info icon={Phone} label="رقم الهاتف" value={lead.normalizedPhone} dir="ltr" />
                <Info icon={UserRound} label="الموظفة" value={lead.agentName || "—"} />
                <Info icon={Building2} label="النشاط" value={detail.listing?.businessName || lead.businessName || "—"} />
                <Info icon={CalendarClock} label="آخر تحديث" value={new Date(lead.updatedAt).toLocaleString("ar-EG")} />
              </div>

              {detail.user && (
                <>
                  <Separator />
                  <div>
                    <p className="mb-2 text-sm font-semibold">صاحب الحساب المرتبط</p>
                    <p className="text-sm">{detail.user.fullName || "مستخدم دليلي"}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">{detail.user.normalizedPhone}</p>
                  </div>
                </>
              )}

              <Separator />
              <div>
                <p className="mb-3 text-sm font-semibold">المتابعات</p>
                {detail.followups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">لا توجد متابعات.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.followups.map((f)=>(
                      <div key={f.id} className="rounded-lg border border-border/70 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span>{f.reason || "متابعة"}</span>
                          <Badge variant="outline">{f.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(f.scheduledAt).toLocaleString("ar-EG")}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />
              <div>
                <p className="mb-3 text-sm font-semibold">سجل النشاط</p>
                <LeadTimeline events={detail.timeline} />
              </div>
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Info({ icon: Icon, label, value, dir }: { icon: typeof Phone; label: string; value: string; dir?: "ltr" | "rtl" }) {
  return (
    <div className="rounded-lg border border-border/70 p-3">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="size-3.5" /> {label}</p>
      <p className="mt-1 text-sm font-medium" dir={dir}>{value}</p>
    </div>
  );
}
