/**
 * Voxora AI — sales pipeline auto-entry.
 * ANY eligible phone added from Administration automatically enters the pipeline:
 *   normalize → duplicate-lead check → create/update lead → fair assignment →
 *   timeline + audit → visible immediately in the sales workspace.
 * Never creates duplicate leads for the same normalized phone without a reason.
 */
import { db } from "@/lib/db";
import { audit, timeline } from "./audit";
import { normalizePhone } from "./phone";
import { assignLeadFairly } from "./assignment";

export interface EnsureLeadInput {
  rawPhone: string;
  listingId?: string | null;
  userId?: string | null;
  businessName?: string;
  customerName?: string;
  source?: string;
  campaign?: string | null;
  actor?: { type: "admin" | "sales_agent" | "system"; id?: string; name?: string };
}

export interface EnsureLeadResult {
  leadId: string;
  created: boolean;
  assignedAgentId: string | null;
  normalizedPhone: string;
  prefix: string | null;
  note: string;
}

const OPEN_FOR_ASSIGNMENT = ["new"];

export async function ensureLead(input: EnsureLeadInput): Promise<EnsureLeadResult | { error: string }> {
  const norm = normalizePhone(input.rawPhone);
  if (!norm.ok) return { error: "invalid_phone" };

  const existing = await db.opsLead.findUnique({ where: { normalizedPhone: norm.canonical } });

  if (existing) {
    // Attach/update instead of duplicating — keep one logical lead per phone.
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (input.listingId && !existing.listingId) data.listingId = input.listingId;
    if (input.userId && !existing.userId) data.userId = input.userId;
    if (input.businessName && !existing.businessName) data.businessName = input.businessName;
    if (input.customerName && !existing.customerName) data.customerName = input.customerName;
    await db.opsLead.update({ where: { id: existing.id }, data });

    await audit({
      actorType: input.actor?.type ?? "system",
      actorId: input.actor?.id ?? null,
      action: "lead.attached",
      entityType: "lead",
      entityId: existing.id,
      oldValue: { listingId: existing.listingId },
      newValue: data,
      source: "pipeline_auto_entry",
    });
    await timeline({
      leadId: existing.id,
      type: "lead_attached",
      actorType: input.actor?.type ?? "system",
      actorName: input.actor?.name ?? null,
      title: "تم تحديث العميل المحتمل برقم موجود مسبقًا (بدون تكرار)",
      data: { listingId: input.listingId ?? null, source: input.source ?? "admin" },
    });

    let agentId = existing.assignedAgentId;
    if (!agentId && OPEN_FOR_ASSIGNMENT.includes(existing.status)) {
      const res = await assignLeadFairly(existing.prefix);
      if (res.agentId) {
        await db.opsLead.update({
          where: { id: existing.id },
          data: { assignedAgentId: res.agentId, status: "assigned" },
        });
        await timeline({
          leadId: existing.id,
          type: "assigned",
          actorType: "system",
          title: `تم تعيين العميل للموظف ${res.agentName}`,
          data: { rationale: res.rationale },
        });
        agentId = res.agentId;
      }
    }
    return {
      leadId: existing.id,
      created: false,
      assignedAgentId: agentId,
      normalizedPhone: norm.canonical,
      prefix: norm.prefix,
      note: "existing_lead_updated",
    };
  }

  // Create new lead + fair assignment
  const res = await assignLeadFairly(norm.prefix);
  const lead = await db.opsLead.create({
    data: {
      rawPhone: input.rawPhone,
      normalizedPhone: norm.canonical,
      prefix: norm.prefix,
      listingId: input.listingId ?? null,
      userId: input.userId ?? null,
      businessName: input.businessName ?? "",
      customerName: input.customerName ?? "",
      source: input.source ?? "admin",
      campaign: input.campaign ?? null,
      status: res.agentId ? "assigned" : "new",
      assignedAgentId: res.agentId,
    },
  });

  await audit({
    actorType: input.actor?.type ?? "system",
    actorId: input.actor?.id ?? null,
    action: "lead.created",
    entityType: "lead",
    entityId: lead.id,
    newValue: {
      normalizedPhone: norm.canonical,
      prefix: norm.prefix,
      assignedAgentId: res.agentId,
      rationale: res.rationale,
    },
    source: "pipeline_auto_entry",
  });

  const events = [
    {
      type: "created",
      actorType: input.actor?.type ?? "system",
      actorName: input.actor?.name ?? null,
      title: "تم إنشاء عميل محتمل تلقائيًا من رقم مُضاف من الإدارة",
      data: { normalizedPhone: norm.canonical, source: input.source ?? "admin" },
    },
  ] as const;
  for (const e of events) {
    await timeline({ leadId: lead.id, ...e });
  }
  if (res.agentId) {
    await timeline({
      leadId: lead.id,
      type: "assigned",
      actorType: "system",
      title: `تم التعيين التلقائي للموظف ${res.agentName} (توزيع عادل: ${norm.prefix ?? "أرقام أخرى"})`,
      data: { rationale: res.rationale },
    });
    await db.opsNotification.create({
      data: {
        targetUserId: res.agentId,
        title: "عميل محتمل جديد",
        body: `تم تعيين ${input.businessName || norm.local} إليك (${norm.prefix ?? ""})`,
        type: "info",
        leadId: lead.id,
      },
    });
  }

  return {
    leadId: lead.id,
    created: true,
    assignedAgentId: res.agentId,
    normalizedPhone: norm.canonical,
    prefix: norm.prefix,
    note: "lead_created_and_assigned",
  };
}
