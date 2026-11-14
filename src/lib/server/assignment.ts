/**
 * Voxora AI — deterministic balanced lead distribution.
 *
 * Goal (from ops spec): for EACH mobile prefix (010/011/012/015) the active sales
 * agents must receive an approximately equal share — e.g. 100 × 010 leads → ≈50/50.
 * Other prefixes are balanced the same way, keeping overall workload balanced.
 *
 * Algorithm: for the lead's prefix, assign to the active agent with the LOWEST
 * existing count of that prefix; ties → lowest total; still ties → stable id order.
 * Deterministic, no waiting for perfect splits, drift ≤ 1 lead for small batches.
 */
import { db } from "@/lib/db";

export interface AssignmentResult {
  agentId: string | null;
  agentName: string | null;
  rationale: string;
}

export async function activeSalesAgents() {
  return db.salesAgent.findMany({
    where: { status: "active", canReceiveLeads: true, role: { in: ["sales", "manager"] } },
    orderBy: { id: "asc" },
  });
}

export async function assignLeadFairly(prefix: string | null): Promise<AssignmentResult> {
  const agents = await activeSalesAgents();
  if (agents.length === 0) return { agentId: null, agentName: null, rationale: "no_active_agents" };
  if (agents.length === 1)
    return { agentId: agents[0].id, agentName: agents[0].name, rationale: "single_agent" };

  // Current counts per agent per prefix + totals
  const leads = await db.opsLead.findMany({
    where: { assignedAgentId: { in: agents.map((a) => a.id) } },
    select: { assignedAgentId: true, prefix: true },
  });
  const perPrefix = new Map<string, Record<string, number>>();
  const totals = new Map<string, number>();
  for (const a of agents) {
    perPrefix.set(a.id, {});
    totals.set(a.id, 0);
  }
  for (const l of leads) {
    if (!l.assignedAgentId) continue;
    const rec = perPrefix.get(l.assignedAgentId)!;
    const key = l.prefix ?? "other";
    rec[key] = (rec[key] ?? 0) + 1;
    totals.set(l.assignedAgentId, (totals.get(l.assignedAgentId) ?? 0) + 1);
  }

  const key = prefix ?? "other";
  let best = agents[0];
  for (const a of agents) {
    const aP = perPrefix.get(a.id)![key] ?? 0;
    const bP = perPrefix.get(best.id)![key] ?? 0;
    if (aP < bP) best = a;
    else if (aP === bP && (totals.get(a.id) ?? 0) < (totals.get(best.id) ?? 0)) best = a;
    // exact tie → keep stable (first by id order) → deterministic
  }
  return {
    agentId: best.id,
    agentName: best.name,
    rationale: `balanced_prefix:${key}:${perPrefix.get(best.id)![key] ?? 0}`,
  };
}

/** Reassign all open (non-terminal) leads of a disabled/removed agent. */
export async function reassignOpenLeads(fromAgentId: string, actor: { type: string; id?: string; name?: string }) {
  const openStatuses = [
    "new", "assigned", "queued", "calling", "ringing", "answered", "callback",
    "whatsapp_followup", "interested", "transferred_to_sales",
  ];
  const openLeads = await db.opsLead.findMany({
    where: { assignedAgentId: fromAgentId, status: { in: openStatuses } },
  });
  const results: { leadId: string; toAgentId: string | null }[] = [];
  for (const lead of openLeads) {
    const res = await assignLeadFairly(lead.prefix);
    const to = res.agentId === fromAgentId ? null : res.agentId;
    await db.opsLead.update({
      where: { id: lead.id },
      data: { assignedAgentId: to, status: to ? "assigned" : "new", updatedAt: new Date() },
    });
    if (to) {
      await db.timelineEvent.create({
        data: {
          leadId: lead.id,
          type: "assigned",
          actorType: actor.type === "admin" ? "admin" : "system",
          actorId: actor.id ?? null,
          actorName: actor.name ?? null,
          title: "تم إعادة توزيع العميل المحتمل بعد تعطيل الموظف المسؤول",
          data: JSON.stringify({ fromAgentId, toAgentId: to, rationale: res.rationale }),
        },
      });
    }
    results.push({ leadId: lead.id, toAgentId: to });
  }
  return results;
}
