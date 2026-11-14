"use client";

import { CalendarClock, ExternalLink, RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useOps } from "@/hooks/use-ops";
import { useOpsUiStore } from "@/stores/ops-ui-store";
import { useUiStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/shared/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AgentDTO } from "@/lib/ops-types";

interface ManagerFollowup {
  id: string;
  leadId: string;
  scheduledAt: string;
  reason: string;
  status: string;
  priority: number;
  createdAt: string;
  completedAt: string | null;
  businessName: string;
  customerName: string;
  phone: string;
  prefix: string;
  agentName: string;
  agentId: string;
}

export function ManagerFollowupsView() {
  const [agentId, setAgentId] = useState("all");
  const agents = useOps<AgentDTO[]>("agents");
  const rows = useOps<ManagerFollowup[]>("followups", { agentId: agentId === "all" ? undefined : agentId }, { pollMs: 30000 });
  const selectLead = useOpsUiStore((s) => s.selectLead);
  const setView = useUiStore((s) => s.setView);

  const sorted = useMemo(() => [...(rows.data ?? [])].sort((a,b)=>new Date(a.scheduledAt).getTime()-new Date(b.scheduledAt).getTime()), [rows.data]);
  const now = Date.now();

  const openLead = (id: string) => {
    selectLead(id);
    setView("sales");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="متابعات الفريق"
        desc="كل المواعيد والمتابعات المسجلة بواسطة موظفات المبيعات."
        actions={<Button variant="outline" size="sm" onClick={rows.refresh}><RefreshCcw className="size-4" /> تحديث</Button>}
      />

      <Select value={agentId} onValueChange={setAgentId}>
        <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل الموظفات</SelectItem>
          {(agents.data ?? []).map((a)=><SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="space-y-2.5">
        {sorted.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد متابعات مسجلة.</CardContent></Card>
        ) : sorted.map((f) => {
          const overdue = f.status === "scheduled" && new Date(f.scheduledAt).getTime() < now;
          return (
            <Card key={f.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{f.businessName || f.customerName || f.phone}</p>
                    <Badge variant="outline">{f.agentName || "—"}</Badge>
                    <Badge variant={overdue ? "destructive" : "secondary"}>{overdue ? "متأخرة" : f.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span dir="ltr" className="font-mono">{f.phone}</span> · {f.reason || "متابعة"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(f.scheduledAt).toLocaleString("ar-EG")}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => openLead(f.leadId)}>
                  <ExternalLink className="size-3.5" /> فتح العميل
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
