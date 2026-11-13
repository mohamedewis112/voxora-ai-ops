/**
 * Voxora AI — Ops API router (single cohesive boundary under /api/ops).
 * Server-only. Actor resolution: demo session is admin (Supabase Auth + RLS in
 * production — see supabase/ops-schema.sql). Never expose service-role keys here
 * in production deployments.
 */
import { db } from "@/lib/db";
import { audit, timeline, notify } from "./audit";
import { normalizePhone } from "./phone";
import { assignLeadFairly, activeSalesAgents, reassignOpenLeads } from "./assignment";
import { findDuplicates, mergeListings, confidenceTier } from "./duplicate";
import { ensureLead } from "./lead-service";
import { processBotQueue, advanceWhatsAppStatuses } from "./simulate";
import { seedIfEmpty } from "./seed";
import { daleelyListingsAdapter, toListingDTO } from "@/integrations/daleely/daleely-listings-adapter";
import { daleelyUsersAdapter } from "@/integrations/daleely/daleely-users-adapter";
import { daleelyOwnershipAdapter } from "@/integrations/daleely/daleely-ownership-adapter";
import { daleelySalesSyncAdapter } from "@/integrations/daleely/daleely-sales-sync-adapter";
import { parseJson } from "./audit";
import { tenantConfig } from "@/config/tenant";
import type {
  LeadDTO, ListingDTO, TimelineEventDTO, AuditLogDTO, MergeJobDTO, BotQueueDTO,
  WhatsAppThreadDTO, WhatsAppMessageDTO, DistributionRowDTO, PerformanceRowDTO, OpsOverviewDTO,
} from "@/lib/ops-types";

/** Demo actor (admin). Production resolves from Supabase Auth session. */
const ACTOR = { type: "admin" as const, id: "demo-admin", name: "أحمد المصري" };

type Json = Record<string, unknown>;
const jsonOk = (data: unknown) => Response.json({ ok: true, data });
const jsonErr = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/* ============================== helpers ============================== */

function leadDTO(l: {
  id: string; rawPhone: string; normalizedPhone: string; prefix: string | null; listingId: string | null;
  userId: string | null; businessName: string; customerName: string; status: string; priority: string;
  assignedAgentId: string | null; originalAgentId: string | null; botStatus: string; source: string;
  campaign: string | null; lastOutcome: string | null; createdAt: Date; updatedAt: Date;
}, agentNames: Map<string, string>, listingNames: Map<string, string>, registeredUserIds: Set<string>): LeadDTO {
  return {
    id: l.id,
    rawPhone: l.rawPhone,
    normalizedPhone: l.normalizedPhone,
    prefix: l.prefix,
    listingId: l.listingId,
    userId: l.userId,
    businessName: l.listingId && listingNames.has(l.listingId) ? listingNames.get(l.listingId)! : l.businessName,
    customerName: l.customerName,
    status: l.status,
    priority: l.priority,
    assignedAgentId: l.assignedAgentId,
    originalAgentId: l.originalAgentId,
    botStatus: l.botStatus,
    source: l.source,
    campaign: l.campaign,
    lastOutcome: l.lastOutcome,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    agentName: l.assignedAgentId ? agentNames.get(l.assignedAgentId) ?? null : null,
    listingName: l.listingId ? listingNames.get(l.listingId) ?? null : null,
    userRegistered: l.userId ? registeredUserIds.has(l.userId) : false,
  };
}

async function expandContext() {
  const agents = await db.salesAgent.findMany();
  const listings = await db.opsListing.findMany({ select: { id: true, businessName: true } });
  const users = await db.opsUser.findMany({ select: { id: true, isRegistered: true } });
  return {
    agentNames: new Map(agents.map((a) => [a.id, a.name])),
    listingNames: new Map(listings.map((l) => [l.id, l.businessName])),
    registeredUserIds: new Set(users.filter((u) => u.isRegistered).map((u) => u.id)),
  };
}

function eventDTO(e: { id: string; leadId: string; type: string; actorType: string; actorId: string | null; actorName: string | null; title: string; data: string; createdAt: Date }): TimelineEventDTO {
  return { ...e, data: parseJson(e.data, {}), createdAt: e.createdAt.toISOString() };
}

function auditDTO(a: { id: string; actorType: string; actorId: string | null; action: string; entityType: string; entityId: string | null; oldValue: string; newValue: string; reason: string | null; source: string | null; metadata: string; createdAt: Date }): AuditLogDTO {
  return {
    ...a,
    oldValue: parseJson(a.oldValue, {}),
    newValue: parseJson(a.newValue, {}),
    metadata: parseJson(a.metadata, {}),
    createdAt: a.createdAt.toISOString(),
  };
}

function listingDTO(l: NonNullable<Awaited<ReturnType<typeof daleelyListingsAdapter.findById>>>, ownerName?: string | null, ownerRegistered?: boolean): ListingDTO {
  return toListingDTO(l, ownerName, ownerRegistered);
}

const LEAD_LISTING_STATUS_MAP: Record<string, string> = {
  closed_business: "closed_business",
  invalid_phone: "invalid_phone",
  out_of_service: "out_of_service",
  wrong_business_phone: "wrong_business_phone",
};

/** Statuses considered "open" for reassignment. */
const OPEN_STATUSES = [
  "new", "assigned", "queued", "calling", "ringing", "answered", "callback",
  "whatsapp_followup", "interested", "transferred_to_sales",
];

/* ============================== GET ============================== */

export async function handleOpsGet(path: string[], req: Request): Promise<Response> {
  await seedIfEmpty();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";

  // ---- overview ----
  if (path[0] === "overview") {
    const [leads, listings, merges, bots, threads, notifs] = await Promise.all([
      db.opsLead.findMany({ select: { prefix: true, status: true, assignedAgentId: true } }),
      daleelyListingsAdapter.list({}),
      db.mergeJob.findMany({ where: { status: "pending_review" }, select: { id: true } }),
      db.botQueueItem.findMany({ select: { status: true } }),
      db.whatsAppThread.findMany({ select: { unreadCount: true } }),
      db.opsNotification.findMany({ where: { read: false }, select: { id: true } }),
    ]);
    const leadsByPrefix: Record<string, number> = {};
    for (const l of leads) {
      const k = l.prefix ?? "other";
      leadsByPrefix[k] = (leadsByPrefix[k] ?? 0) + 1;
    }
    const agents = await activeSalesAgents();
    const distribution: DistributionRowDTO[] = [];
    const pool = [...agents];
    // include disabled agents that still own leads for transparency
    const agentIds = new Set(pool.map((a) => a.id));
    for (const l of leads) if (l.assignedAgentId && !agentIds.has(l.assignedAgentId)) agentIds.add(l.assignedAgentId);
    const allAgents = await db.salesAgent.findMany({ where: { id: { in: [...agentIds] } }, orderBy: { id: "asc" } });
    for (const a of allAgents) {
      const mine = leads.filter((l) => l.assignedAgentId === a.id);
      const counts: Record<string, number> = {};
      for (const l of mine) {
        const k = l.prefix ?? "other";
        counts[k] = (counts[k] ?? 0) + 1;
      }
      distribution.push({ agentId: a.id, agentName: a.name, status: a.status, counts, total: mine.length });
    }
    const callStatusCounts: Record<string, number> = {};
    for (const l of leads) callStatusCounts[l.status] = (callStatusCounts[l.status] ?? 0) + 1;
    const data: OpsOverviewDTO = {
      totalLeads: leads.length,
      leadsByPrefix,
      distribution,
      unclaimedCount: listings.filter((l) => !l.ownerUserId && l.status !== "merged").length,
      pendingMerges: merges.length,
      botQueued: bots.filter((b) => b.status === "queued").length,
      botRunning: bots.filter((b) => b.status === "running").length,
      whatsappUnread: threads.reduce((s, t) => s + t.unreadCount, 0),
      callStatusCounts,
      invalidCount: listings.filter((l) => l.status === "invalid_phone" || l.status === "wrong_business_phone").length,
      closedCount: listings.filter((l) => l.status === "closed_business").length,
      hiddenCount: listings.filter((l) => l.status === "hidden" || l.status === "suspended").length,
      notificationsUnread: notifs.length,
    };
    return jsonOk(data);
  }

  // ---- agents ----
  if (path[0] === "agents") {
    const agents = await db.salesAgent.findMany({ orderBy: { createdAt: "asc" } });
    const leads = await db.opsLead.findMany({ select: { assignedAgentId: true } });
    return jsonOk(agents.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      activeLeads: leads.filter((l) => l.assignedAgentId === a.id).length,
    })));
  }

  // ---- leads list ----
  if (path[0] === "leads" && !path[1]) {
    const agentId = url.searchParams.get("agentId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const prefix = url.searchParams.get("prefix") ?? undefined;
    const leadRows = await db.opsLead.findMany({
      where: {
        ...(agentId ? { assignedAgentId: agentId } : {}),
        ...(status && status !== "all" ? { status } : {}),
        ...(prefix && prefix !== "all" ? { prefix } : {}),
        ...(q
          ? {
              OR: [
                { normalizedPhone: { contains: q } },
                { rawPhone: { contains: q } },
                { businessName: { contains: q } },
                { customerName: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
    const ctx = await expandContext();
    return jsonOk(leadRows.map((l) => leadDTO(l, ctx.agentNames, ctx.listingNames, ctx.registeredUserIds)));
  }

  // ---- lead detail ----
  if (path[0] === "leads" && path[1] && path[2] === "detail") {
    const lead = await db.opsLead.findUnique({ where: { id: path[1] } });
    if (!lead) return jsonErr("lead_not_found", 404);
    const ctx = await expandContext();
    const [events, attempts, followups, thread] = await Promise.all([
      db.timelineEvent.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "asc" } }),
      db.opsCallAttempt.findMany({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" } }),
      db.opsFollowup.findMany({ where: { leadId: lead.id }, orderBy: { scheduledAt: "desc" } }),
      db.whatsAppThread.findFirst({ where: { leadId: lead.id } }),
    ]);
    const listing = lead.listingId ? await daleelyListingsAdapter.findById(lead.listingId) : null;
    const user = lead.userId ? await daleelyUsersAdapter.findById(lead.userId) : null;
    const botItem = await db.botQueueItem.findUnique({ where: { leadId: lead.id } });
    return jsonOk({
      lead: leadDTO(lead, ctx.agentNames, ctx.listingNames, ctx.registeredUserIds),
      timeline: events.map(eventDTO),
      calls: attempts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), startedAt: a.startedAt?.toISOString() ?? null, endedAt: a.endedAt?.toISOString() ?? null })),
      followups: followups.map((f) => ({ ...f, scheduledAt: f.scheduledAt.toISOString(), createdAt: f.createdAt.toISOString(), completedAt: f.completedAt?.toISOString() ?? null })),
      listing: listing ? listingDTO(listing) : null,
      user: user ? { id: user.id, fullName: user.fullName, isRegistered: user.isRegistered, normalizedPhone: user.normalizedPhone } : null,
      botItem: botItem ? { ...botItem, addedAt: botItem.addedAt.toISOString(), startedAt: botItem.startedAt?.toISOString() ?? null, finishedAt: botItem.finishedAt?.toISOString() ?? null, scheduledAt: botItem.scheduledAt?.toISOString() ?? null } : null,
    });
  }

  // ---- phone lookup (registered account recognition + candidates) ----
  if (path[0] === "lookup") {
    const phone = url.searchParams.get("phone") ?? "";
    const n = normalizePhone(phone);
    if (!n.ok) return jsonErr("invalid_phone");
    const user = await daleelyUsersAdapter.findByPhone(n.canonical);
    const owned = user
      ? (await daleelyListingsAdapter.list({})).filter((l) => l.ownerUserId === user.id)
      : [];
    const unclaimedListings = (await daleelyListingsAdapter.list({ unclaimedOnly: true }))
      .filter((l) => l.normalizedPhone === n.canonical);
    const existingLead = await db.opsLead.findUnique({ where: { normalizedPhone: n.canonical } });
    const leadIdsForPhone = existingLead ? [existingLead.id] : [];
    const recentCalls = leadIdsForPhone.length
      ? await db.opsCallAttempt.count({ where: { leadId: { in: leadIdsForPhone } } })
      : 0;
    const waThreads = await db.whatsAppThread.count({ where: { phoneNormalized: n.canonical } });
    const ctx = await expandContext();
    return jsonOk({
      normalizedPhone: n.canonical,
      prefix: n.prefix,
      registered: !!user?.isRegistered,
      registeredUserName: user?.isRegistered ? user.fullName : null,
      ownedListings: owned.map((l) => listingDTO(l)),
      potentialUnclaimed: unclaimedListings.map((l) => ({ listing: listingDTO(l), matchScore: 90, matchReason: "نفس رقم الهاتف" })),
      existingLead: existingLead ? leadDTO(existingLead, ctx.agentNames, ctx.listingNames, ctx.registeredUserIds) : null,
      recentCalls,
      whatsappThreads: waThreads,
    });
  }

  // ---- unclaimed businesses ----
  if (path[0] === "unclaimed") {
    const status = url.searchParams.get("status") ?? "unclaimed";
    const statuses =
      status === "unclaimed" ? undefined :
      status === "hidden" ? ["hidden", "suspended"] :
      status === "closed" ? ["closed_business"] :
      status === "invalid" ? ["invalid_phone", "out_of_service", "wrong_business_phone"] :
      status === "merged" ? ["merged"] :
      [status];
    const rows = await daleelyListingsAdapter.list({ q, statuses, unclaimedOnly: status === "unclaimed" });
    const owners = await db.opsUser.findMany();
    const ownerMap = new Map(owners.map((o) => [o.id, o]));
    const leads = await db.opsLead.findMany({ select: { normalizedPhone: true, assignedAgentId: true, updatedAt: true, id: true } });
    const agents = await db.salesAgent.findMany();
    const agentMap = new Map(agents.map((a) => [a.id, a.name]));
    type UnclaimedRow = ListingDTO & {
      ownerCandidates: { userId: string | null; fullName: string; normalizedPhone: string; isRegistered: boolean; matchScore: number; matchReason: string }[];
      leadAgentName: string | null;
      lastContactAt: string | null;
      leadId: string | null;
    };
    const data: UnclaimedRow[] = [];
    for (const l of rows) {
      const lead = leads.find((x) => x.normalizedPhone === l.normalizedPhone);
      const candidates = await daleelyUsersAdapter.ownerCandidates(l.normalizedPhone, l.businessName);
      data.push({
        ...listingDTO(l),
        ownerCandidates: candidates,
        leadAgentName: lead ? agentMap.get(lead.assignedAgentId ?? "") ?? null : null,
        lastContactAt: lead ? lead.updatedAt.toISOString() : null,
        leadId: lead?.id ?? null,
      });
    }
    return jsonOk(data);
  }

  // ---- merge review ----
  if (path[0] === "duplicates") {
    const jobs = await db.mergeJob.findMany({ orderBy: { createdAt: "desc" } });
    const data: MergeJobDTO[] = [];
    for (const j of jobs) {
      const canonical = await daleelyListingsAdapter.findById(j.canonicalListingId);
      const duplicate = await daleelyListingsAdapter.findById(j.duplicateListingId);
      data.push({
        id: j.id,
        canonicalListingId: j.canonicalListingId,
        duplicateListingId: j.duplicateListingId,
        confidence: j.confidence,
        reasons: parseJson(j.reasons, []),
        status: j.status,
        fieldChanges: parseJson(j.fieldChanges, []),
        createdAt: j.createdAt.toISOString(),
        reviewedAt: j.reviewedAt?.toISOString() ?? null,
        canonical: canonical ? listingDTO(canonical) : null,
        duplicate: duplicate ? listingDTO(duplicate) : null,
      });
    }
    return jsonOk(data);
  }

  // ---- bot queue (lazy processing first) ----
  if (path[0] === "bot-queue") {
    await processBotQueue();
    const items = await db.botQueueItem.findMany({ orderBy: [{ priority: "asc" }, { addedAt: "asc" }] });
    const ctx = await expandContext();
    const data: BotQueueDTO[] = [];
    for (const item of items) {
      const lead = await db.opsLead.findUnique({ where: { id: item.leadId } });
      data.push({
        ...item,
        addedAt: item.addedAt.toISOString(),
        startedAt: item.startedAt?.toISOString() ?? null,
        finishedAt: item.finishedAt?.toISOString() ?? null,
        scheduledAt: item.scheduledAt?.toISOString() ?? null,
        lead: lead ? leadDTO(lead, ctx.agentNames, ctx.listingNames, ctx.registeredUserIds) : null,
      });
    }
    return jsonOk(data);
  }

  // ---- whatsapp ----
  if (path[0] === "whatsapp" && path[1] === "threads" && !path[2]) {
    await advanceWhatsAppStatuses();
    const threads = await db.whatsAppThread.findMany({
      orderBy: { lastMessageAt: "desc" },
      ...(q ? { where: { OR: [{ displayName: { contains: q } }, { phoneNormalized: { contains: q } }] } } : {}),
    });
    const ctx = await expandContext();
    const data: WhatsAppThreadDTO[] = [];
    for (const t of threads) {
      const last = await db.whatsAppMessage.findFirst({ where: { threadId: t.id }, orderBy: { createdAt: "desc" } });
      const lead = t.leadId ? await db.opsLead.findUnique({ where: { id: t.leadId } }) : null;
      data.push({
        id: t.id,
        leadId: t.leadId,
        phoneNormalized: t.phoneNormalized,
        displayName: t.displayName,
        listingId: t.listingId,
        lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
        unreadCount: t.unreadCount,
        lastMessagePreview: last?.body ?? "",
        lastMessageStatus: last?.status ?? "",
        lead: lead ? leadDTO(lead, ctx.agentNames, ctx.listingNames, ctx.registeredUserIds) : null,
      });
    }
    return jsonOk(data);
  }
  if (path[0] === "whatsapp" && path[1] === "threads" && path[2]) {
    await advanceWhatsAppStatuses();
    const thread = await db.whatsAppThread.findUnique({ where: { id: path[2] } });
    if (!thread) return jsonErr("thread_not_found", 404);
    await db.whatsAppThread.update({ where: { id: thread.id }, data: { unreadCount: 0 } });
    const messages = await db.whatsAppMessage.findMany({ where: { threadId: thread.id }, orderBy: { createdAt: "asc" } });
    const ctx = await expandContext();
    const lead = thread.leadId ? await db.opsLead.findUnique({ where: { id: thread.leadId } }) : null;
    const data = {
      thread: { ...thread, lastMessageAt: thread.lastMessageAt?.toISOString() ?? null, createdAt: thread.createdAt.toISOString(), lead: lead ? leadDTO(lead, ctx.agentNames, ctx.listingNames, ctx.registeredUserIds) : null },
      messages: messages.map((m) => ({
        id: m.id, threadId: m.threadId, direction: m.direction as "out" | "in", body: m.body,
        template: m.template, status: m.status, actorType: m.actorType,
        sentAt: m.sentAt?.toISOString() ?? null, deliveredAt: m.deliveredAt?.toISOString() ?? null,
        readAt: m.readAt?.toISOString() ?? null, createdAt: m.createdAt.toISOString(),
      })) as WhatsAppMessageDTO[],
    };
    return jsonOk(data);
  }

  // ---- audit ----
  if (path[0] === "audit") {
    const action = url.searchParams.get("action") ?? undefined;
    const actor = url.searchParams.get("actor") ?? undefined;
    const entity = url.searchParams.get("entity") ?? undefined;
    const rows = await db.auditLog.findMany({
      where: {
        ...(action && action !== "all" ? { action: { contains: action } } : {}),
        ...(actor && actor !== "all" ? { actorType: actor } : {}),
        ...(entity && entity !== "all" ? { entityType: entity } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return jsonOk(rows.map(auditDTO));
  }

  // ---- performance (sales vs AI) ----
  if (path[0] === "performance") {
    const attempts = await db.opsCallAttempt.findMany();
    const linked = await db.opsLead.findMany({ select: { status: true, assignedAgentId: true, originalAgentId: true } });
    const rows: PerformanceRowDTO[] = [];
    const agents = await db.salesAgent.findMany({ where: { role: { in: ["sales", "manager"] } } });
    for (const a of agents) {
      const mine = attempts.filter((x) => x.agentType === "sales_agent" && x.agentId === a.id);
      const answered = mine.filter((x) => x.outcome === "answered" || x.outcome === "interested" || x.outcome === "not_interested" || x.outcome === "callback").length;
      const interested = mine.filter((x) => x.outcome === "interested").length;
      const myLinked = linked.filter((l) => l.status === "linked" && (l.assignedAgentId === a.id || l.originalAgentId === a.id)).length;
      rows.push({
        label: a.name,
        kind: "sales",
        calls: mine.length,
        answered,
        interested,
        followups: mine.filter((x) => x.outcome === "callback").length,
        linked: myLinked,
        conversionRate: mine.length ? Math.round((myLinked / mine.length) * 100) : 0,
      });
    }
    const ai = attempts.filter((x) => x.agentType === "ai_agent");
    const aiLinked = linked.filter((l) => l.status === "linked").length;
    rows.push({
      label: "AI Agent (محاكاة)",
      kind: "ai",
      calls: ai.length,
      answered: ai.filter((x) => ["answered", "interested", "not_interested", "callback"].includes(x.outcome)).length,
      interested: ai.filter((x) => x.outcome === "interested").length,
      followups: ai.filter((x) => x.outcome === "callback").length,
      linked: aiLinked,
      conversionRate: ai.length ? Math.round((aiLinked / ai.length) * 100) : 0,
    });
    return jsonOk(rows);
  }

  // ---- notifications ----
  if (path[0] === "notifications") {
    const rows = await db.opsNotification.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return jsonOk(rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })));
  }

  // ---- listings management (hidden/closed/invalid + restore) ----
  if (path[0] === "listings") {
    const status = url.searchParams.get("status") ?? "all";
    const statuses = status === "all" ? undefined : status === "problematic"
      ? ["hidden", "suspended", "closed_business", "invalid_phone", "out_of_service", "wrong_business_phone", "merged"]
      : [status];
    const rows = await daleelyListingsAdapter.list({ q, statuses });
    const users = await db.opsUser.findMany();
    const userMap = new Map(users.map((u) => [u.id, u]));
    return jsonOk(rows.map((l) => listingDTO(l, l.ownerUserId ? userMap.get(l.ownerUserId)?.fullName ?? null : null, l.ownerUserId ? userMap.get(l.ownerUserId)?.isRegistered ?? false : false)));
  }

  return jsonErr("unknown_route:" + path.join("/"), 404);
}

/* ============================== POST ============================== */

export async function handleOpsPost(path: string[], req: Request): Promise<Response> {
  await seedIfEmpty();
  let body: Json = {};
  try {
    body = (await req.json()) as Json;
  } catch {
    body = {};
  }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");

  // ---- FLOW A: admin adds eligible phone → auto pipeline entry ----
  if (path[0] === "leads" && !path[1]) {
    const rawPhone = str("phone") || str("rawPhone");
    const res = await ensureLead({
      rawPhone,
      businessName: str("businessName") || undefined,
      customerName: str("customerName") || undefined,
      campaign: str("campaign") || undefined,
      source: str("source") || "admin",
      actor: ACTOR,
    });
    if ("error" in res) return jsonErr(res.error);
    await daleelySalesSyncAdapter.leadCreated({ leadId: res.leadId, normalizedPhone: res.normalizedPhone, agentId: res.assignedAgentId });
    return jsonOk(res);
  }

  // ---- admin adds a business (website-submission equivalent) → duplicate check ----
  if (path[0] === "listings" && !path[1]) {
    const businessName = str("businessName");
    const rawPhone = str("phone");
    const n = normalizePhone(rawPhone);
    if (!businessName) return jsonErr("missing_business_name");
    if (!n.ok) return jsonErr("invalid_phone");

    const ownerPhone = str("ownerPhone");
    let ownerUserId: string | null = null;
    let ownerPhoneNormalized: string | null = null;
    let ownerUser: Awaited<ReturnType<typeof daleelyUsersAdapter.findByPhone>> = null;
    if (ownerPhone) {
      const on = normalizePhone(ownerPhone);
      if (on.ok) {
        ownerUser = await daleelyUsersAdapter.findByPhone(on.canonical);
        if (!ownerUser) {
          ownerUser = await daleelyUsersAdapter.create({
            fullName: str("ownerName") || businessName,
            rawPhone: ownerPhone,
            normalizedPhone: on.canonical,
            isRegistered: false,
          });
        }
        ownerUserId = ownerUser.id;
        ownerPhoneNormalized = on.canonical;
      }
    }

    // CRITICAL: duplicate detection BEFORE creating anything public
    const matches = await findDuplicates({
      businessName,
      phone: rawPhone,
      category: str("category") || null,
      governorate: str("governorate") || null,
    });
    const tier = matches.length ? confidenceTier(matches[0].confidence) : "none";

    const created = await daleelyListingsAdapter.create({
      businessName,
      rawPhone,
      normalizedPhone: n.canonical,
      whatsapp: str("whatsapp") || null,
      category: str("category") || null,
      governorate: str("governorate") || null,
      city: str("city") || null,
      village: str("village") || null,
      address: str("address") || null,
      description: str("description") || null,
      ownerUserId,
      ownerPhoneNormalized,
      status: "active",
      source: str("source") || "admin",
    });

    await audit({
      actorType: "admin", actorId: ACTOR.id,
      action: "listing.created", entityType: "listing", entityId: created.id,
      newValue: { businessName, normalizedPhone: n.canonical },
      source: "admin_add",
    });

    // FLOW H: very strong duplicate → auto safe merge + positive owner notification
    if (tier === "auto" && matches.length) {
      const merge = await mergeListings({
        canonicalId: matches[0].listingId,
        duplicateId: created.id,
        confidence: matches[0].confidence,
        reasons: matches[0].reasons,
        actor: ACTOR,
        auto: true,
        source: "admin_add_duplicate_check",
      });
      // pipeline entry still happens for the SAME phone (no duplicate lead)
      const leadRes = await ensureLead({
        rawPhone,
        listingId: merge.canonicalListingId,
        userId: ownerUserId,
        businessName,
        source: "admin",
        actor: ACTOR,
      });
      return jsonOk({
        created: true, merged: true, mergeJobId: merge.mergeJobId,
        canonicalListingId: merge.canonicalListingId, fieldChanges: merge.fieldChanges,
        duplicateListingId: created.id,
        ownerNotified: !!ownerUserId || !!ownerPhoneNormalized,
        successMessage: ownerUser ? tenantConfig.successLinkMessage : null,
        lead: leadRes,
      });
    }

    // medium confidence → pending manual review (new listing stays suspended)
    if (tier === "review" && matches.length) {
      await daleelyListingsAdapter.updateStatus(created.id, "suspended");
      const job = await db.mergeJob.create({
        data: {
          canonicalListingId: matches[0].listingId,
          duplicateListingId: created.id,
          confidence: matches[0].confidence,
          reasons: JSON.stringify(matches[0].reasons),
          status: "pending_review",
        },
      });
      await audit({
        actorType: "admin", actorId: ACTOR.id,
        action: "merge.pending_review_created", entityType: "merge_job", entityId: job.id,
        newValue: { confidence: matches[0].confidence },
        reason: "متوسط الثقة — يُمنع الدمج التلقائي", source: "admin_add_duplicate_check",
      });
      const leadRes = await ensureLead({ rawPhone, listingId: created.id, userId: ownerUserId, businessName, source: "admin", actor: ACTOR });
      return jsonOk({ created: true, merged: false, pendingReview: true, mergeJobId: job.id, lead: leadRes });
    }

    // normal path: create + owner link attempt + auto pipeline entry
    let ownerLinked = false;
    if (ownerUserId) {
      const link = await daleelyOwnershipAdapter.linkOwner({
        listingId: created.id,
        userId: ownerUser?.isRegistered ? ownerUserId : null,
        phoneNormalized: ownerPhoneNormalized!,
        method: ownerUser?.isRegistered ? "auto" : "manual",
        confidence: ownerUser?.isRegistered ? 92 : 60,
        reason: ownerUser?.isRegistered ? "رقم المالك مطابق لحساب مسجل" : "ربط يدوي من الإدارة",
        actor: ACTOR,
      });
      ownerLinked = link.linked;
    }
    const leadRes = await ensureLead({
      rawPhone, listingId: created.id, userId: ownerUserId, businessName,
      customerName: ownerUser?.fullName, source: "admin", actor: ACTOR,
    });
    return jsonOk({
      created: true, merged: false, pendingReview: false, listingId: created.id,
      ownerLinked, ownerRegistered: ownerUser?.isRegistered ?? false,
      registeredBadge: ownerUser?.isRegistered ? tenantConfig.registeredBadge : null,
      lead: leadRes,
    });
  }

  // ---- restore listing (admin) ----
  if (path[0] === "listings" && path[2] === "restore") {
    const listing = await daleelyListingsAdapter.findById(path[1]);
    if (!listing) return jsonErr("listing_not_found", 404);
    await daleelyListingsAdapter.restore(path[1]);
    await audit({
      actorType: "admin", actorId: ACTOR.id,
      action: "listing.restored", entityType: "listing", entityId: path[1],
      oldValue: { status: listing.status }, newValue: { status: "active" },
      reason: str("reason") || "استرجاع من قبل الإدارة", source: "admin_restore",
    });
    await notify({ targetUserId: listing.ownerUserId, targetPhone: listing.ownerPhoneNormalized, title: "تم استرجاع نشاطك", body: "تم استرجاع نشاطك وإعادة ظهوره بعد المراجعة", type: "success" });
    return jsonOk({ restored: true, listingId: path[1] });
  }

  // ---- lead actions ----
  if (path[0] === "leads" && path[1]) {
    const lead = await db.opsLead.findUnique({ where: { id: path[1] } });
    if (!lead) return jsonErr("lead_not_found", 404);
    const leadId = lead.id;

    // FLOW D: call outcome — busy/no-answer NEVER change business visibility (I/J)
    if (path[2] === "outcome") {
      const outcome = str("outcome");
      const valid = ["busy", "no_answer", "switched_off", "invalid_number", "out_of_service",
        "answered", "interested", "not_interested", "callback", "whatsapp_followup", "linked",
        "transferred_to_sales", "closed_business", "completed", "failed"];
      if (!valid.includes(outcome)) return jsonErr("invalid_outcome");
      const from = lead.status;
      const statusMap: Record<string, string> = {
        busy: "busy", no_answer: "no_answer", switched_off: "switched_off",
        invalid_number: "invalid_number", out_of_service: "out_of_service",
        interested: "interested", not_interested: "not_interested", callback: "callback",
        whatsapp_followup: "whatsapp_followup", linked: "linked",
        transferred_to_sales: "transferred_to_sales", closed_business: "closed_business",
        answered: "answered", completed: "completed", failed: "failed",
      };
      const newStatus = statusMap[outcome] ?? "assigned";
      await db.opsLead.update({ where: { id: leadId }, data: { status: newStatus, lastOutcome: outcome, updatedAt: new Date() } });
      const attempt = await db.opsCallAttempt.create({
        data: {
          leadId, agentType: "sales_agent", agentId: lead.assignedAgentId,
          outcome, reason: str("reason") || null, confidence: typeof body.confidence === "number" ? body.confidence as number : null,
          notes: str("notes") || null,
          durationSec: typeof body.durationSec === "number" ? Math.round(body.durationSec as number) : 0,
          startedAt: new Date(), endedAt: new Date(),
        },
      });
      await timeline({ leadId, type: "call_outcome", actorType: "sales_agent", actorId: ACTOR.id, actorName: ACTOR.name, title: `نتيجة اتصال: ${outcome}`, data: { outcome, notes: str("notes"), reason: str("reason") } });
      await audit({ actorType: "sales_agent", actorId: ACTOR.id, action: "lead.outcome", entityType: "lead", entityId: leadId, oldValue: { status: from }, newValue: { status: newStatus, outcome }, source: "sales_workspace" });
      await daleelySalesSyncAdapter.leadStatusChanged({ leadId, from, to: newStatus });
      if (outcome === "callback" && str("callbackAt")) {
        const at = new Date(str("callbackAt"));
        await db.opsFollowup.create({ data: { leadId, scheduledAt: at, reason: str("reason") || "مكالمة مجدولة", assigneeId: lead.assignedAgentId } });
        await timeline({ leadId, type: "callback_scheduled", actorType: "sales_agent", title: "تم جدولة مكالمة رجوع", data: { scheduledAt: at.toISOString() } });
      }
      return jsonOk({ ok: true, status: newStatus, attemptId: attempt.id, businessVisibilityChanged: false });
    }

    // FLOW E: add to AI bot — same lead, original owner preserved
    if (path[2] === "bot") {
      if (lead.botStatus === "queued" || lead.botStatus === "running") return jsonErr("already_in_bot_queue");
      const priority = typeof body.priority === "number" ? body.priority as number : 5;
      await db.botQueueItem.upsert({
        where: { leadId },
        create: { leadId, status: "queued", priority, addedById: ACTOR.id },
        update: { status: "queued", priority, addedAt: new Date(), finishedAt: null, lastResult: null },
      });
      await db.opsLead.update({
        where: { id: leadId },
        data: { botStatus: "queued", originalAgentId: lead.originalAgentId ?? lead.assignedAgentId, status: "queued", updatedAt: new Date() },
      });
      await timeline({ leadId, type: "bot_added", actorType: "admin", actorId: ACTOR.id, actorName: ACTOR.name, title: "تمت إضافة العميل إلى طابور AI Bot", data: { originalAgentId: lead.originalAgentId ?? lead.assignedAgentId } });
      await audit({ actorType: "admin", actorId: ACTOR.id, action: "lead.bot_added", entityType: "lead", entityId: leadId, newValue: { botStatus: "queued", originalOwnerPreserved: true }, source: "sales_workspace" });
      return jsonOk({ ok: true, botStatus: "queued" });
    }

    // manual owner linking (FLOW G)
    if (path[2] === "link-owner") {
      const listingId = str("listingId");
      const listing = await daleelyListingsAdapter.findById(listingId);
      if (!listing) return jsonErr("listing_not_found", 404);
      const userId = str("userId") || null;
      const res = await daleelyOwnershipAdapter.linkOwner({
        listingId, userId, phoneNormalized: lead.normalizedPhone,
        method: "manual", confidence: 100,
        reason: str("reason") || "ربط يدوي بواسطة المبيعات",
        actor: { type: "sales_agent", id: ACTOR.id, name: ACTOR.name },
      });
      if (!res.linked) return jsonErr(res.reason);
      await db.opsLead.update({ where: { id: leadId }, data: { status: "linked", lastOutcome: "linked", listingId, userId, updatedAt: new Date() } });
      await timeline({ leadId, type: "ownership_linked", actorType: "sales_agent", actorName: ACTOR.name, title: "تم ربط النشاط بصاحبه بنجاح", data: { listingId } });
      await audit({ actorType: "sales_agent", actorId: ACTOR.id, action: "lead.linked", entityType: "lead", entityId: leadId, newValue: { listingId, userId }, source: "owner_linking" });
      return jsonOk({ ok: true, status: "linked", successMessage: tenantConfig.successLinkMessage });
    }

    // FLOW K: confirm closed/invalid business → visibility change per policy
    if (path[2] === "confirm-business-status") {
      const listingStatus = str("listingStatus");
      if (!LEAD_LISTING_STATUS_MAP[listingStatus]) return jsonErr("invalid_listing_status");
      const listing = lead.listingId ? await daleelyListingsAdapter.findById(lead.listingId) : null;
      if (!listing) return jsonErr("no_listing_attached", 400);
      const confidence = typeof body.confidence === "number" ? body.confidence as number : 90;
      if (confidence < 70) return jsonErr("confidence_too_low_for_visibility_change");
      const from = listing.status;
      await daleelyListingsAdapter.updateStatus(listing.id, listingStatus);
      await db.opsLead.update({ where: { id: leadId }, data: { status: LEAD_LISTING_STATUS_MAP[listingStatus], lastOutcome: listingStatus, updatedAt: new Date() } });
      await db.opsCallAttempt.create({
        data: { leadId, agentType: "sales_agent", agentId: lead.assignedAgentId, outcome: listingStatus, reason: str("reason") || null, confidence, notes: str("notes") || null },
      });
      await timeline({ leadId, type: "listing_hidden", actorType: "sales_agent", actorName: ACTOR.name, title: "تم تغيير حالة النشاط بعد تأكيد موثق", data: { from, to: listingStatus, reason: str("reason"), confidence } });
      await audit({
        actorType: "sales_agent", actorId: ACTOR.id,
        action: "listing.status_changed", entityType: "listing", entityId: listing.id,
        oldValue: { status: from }, newValue: { status: listingStatus },
        reason: str("reason") || "تأكيد موثق من المكالمة", source: "call_confirmation",
        metadata: { confidence, restorable: true, leadId },
      });
      return jsonOk({ ok: true, listingStatus, restorable: true });
    }

    // transfer lead
    if (path[2] === "transfer") {
      const toAgentId = str("toAgentId");
      const target = await db.salesAgent.findUnique({ where: { id: toAgentId } });
      if (!target || target.status !== "active") return jsonErr("invalid_target_agent");
      const from = lead.assignedAgentId;
      await db.opsLead.update({ where: { id: leadId }, data: { assignedAgentId: toAgentId, status: "transferred_to_sales", updatedAt: new Date() } });
      await timeline({ leadId, type: "transferred", actorType: "admin", actorName: ACTOR.name, title: `تم تحويل العميل إلى ${target.name}`, data: { from, to: toAgentId } });
      await audit({ actorType: "admin", actorId: ACTOR.id, action: "lead.transferred", entityType: "lead", entityId: leadId, oldValue: { assignedAgentId: from }, newValue: { assignedAgentId: toAgentId }, source: "sales_workspace" });
      await notify({ targetUserId: toAgentId, title: "عميل محتمل محوَّل إليك", body: `${lead.businessName || lead.normalizedPhone} — من ${ACTOR.name}`, type: "info", leadId });
      return jsonOk({ ok: true });
    }

    // add note (AI/Sales/System labels; never overwrite human notes)
    if (path[2] === "notes") {
      const note = str("body");
      if (!note) return jsonErr("empty_note");
      await timeline({ leadId, type: "note", actorType: "admin", actorId: ACTOR.id, actorName: ACTOR.name, title: note, data: { source: "sales_agent" } });
      return jsonOk({ ok: true });
    }

    // schedule callback
    if (path[2] === "callback") {
      const at = str("scheduledAt");
      if (!at) return jsonErr("missing_scheduledAt");
      await db.opsFollowup.create({ data: { leadId, scheduledAt: new Date(at), reason: str("reason") || "مكالمة مجدولة", assigneeId: lead.assignedAgentId, priority: str("priority") || "normal" } });
      await db.opsLead.update({ where: { id: leadId }, data: { status: "callback", updatedAt: new Date() } });
      await timeline({ leadId, type: "callback_scheduled", actorType: "sales_agent", actorName: ACTOR.name, title: "تم جدولة مكالمة رجوع", data: { scheduledAt: at, reason: str("reason") } });
      return jsonOk({ ok: true });
    }

    // FLOW L: whatsapp follow-up stays attached to the SAME lead
    if (path[2] === "whatsapp-followup") {
      let thread = await db.whatsAppThread.findFirst({ where: { leadId } });
      if (!thread) {
        thread = await db.whatsAppThread.create({
          data: {
            leadId, phoneNormalized: lead.normalizedPhone,
            displayName: lead.customerName || lead.businessName || lead.normalizedPhone,
            listingId: lead.listingId,
          },
        });
      }
      const bodyText = str("body") || "متابعة من فريق دليلي — هل يمكننا تحديث بيانات نشاطك؟";
      const msg = await db.whatsAppMessage.create({
        data: { threadId: thread.id, direction: "out", body: bodyText, template: str("template") || null, status: "queued", actorType: "sales_agent", actorId: ACTOR.id },
      });
      await db.whatsAppThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
      await db.opsLead.update({ where: { id: leadId }, data: { status: "whatsapp_followup", lastOutcome: "whatsapp_followup", updatedAt: new Date() } });
      await timeline({ leadId, type: "whatsapp_sent", actorType: "sales_agent", actorName: ACTOR.name, title: "متابعة واتساب مرسلة للعميل", data: { threadId: thread.id, messageId: msg.id } });
      await audit({ actorType: "sales_agent", actorId: ACTOR.id, action: "whatsapp.followup_sent", entityType: "lead", entityId: leadId, newValue: { threadId: thread.id }, source: "whatsapp_module" });
      return jsonOk({ ok: true, threadId: thread.id, messageId: msg.id, demoMode: true });
    }
  }

  // ---- bot queue actions ----
  if (path[0] === "bot-queue" && path[1] && path[2] === "action") {
    const item = await db.botQueueItem.findUnique({ where: { id: path[1] } });
    if (!item) return jsonErr("queue_item_not_found", 404);
    const action = str("action");
    const lead = await db.opsLead.findUnique({ where: { id: item.leadId } });
    if (action === "start") {
      await db.botQueueItem.update({ where: { id: item.id }, data: { status: "running", startedAt: new Date() } });
      await db.opsLead.update({ where: { id: item.leadId }, data: { botStatus: "running", status: "calling" } });
      await timeline({ leadId: item.leadId, type: "bot_started", actorType: "ai_agent", title: "بدأ AI Bot معالجة العميل (وضع المحاكاة)" });
    } else if (action === "pause") {
      await db.botQueueItem.update({ where: { id: item.id }, data: { status: "paused" } });
      await db.opsLead.update({ where: { id: item.leadId }, data: { botStatus: "queued", status: "queued" } });
    } else if (action === "resume") {
      await db.botQueueItem.update({ where: { id: item.id }, data: { status: "queued" } });
      await db.opsLead.update({ where: { id: item.leadId }, data: { botStatus: "queued", status: "queued" } });
    } else if (action === "remove") {
      await db.botQueueItem.delete({ where: { id: item.id } });
      if (lead) {
        await db.opsLead.update({ where: { id: lead.id }, data: { botStatus: "none", status: lead.assignedAgentId ? "assigned" : "new" } });
        await timeline({ leadId: lead.id, type: "bot_removed", actorType: "admin", actorName: ACTOR.name, title: "تمت إزالة العميل من طابور البوت" });
      }
    } else if (action === "prioritize") {
      await db.botQueueItem.update({ where: { id: item.id }, data: { priority: Math.max(1, item.priority - 2) } });
    } else if (action === "return_to_sales") {
      await db.botQueueItem.update({ where: { id: item.id }, data: { status: "returned", finishedAt: new Date() } });
      if (lead) {
        // ownership preserved — returns to the ORIGINAL sales owner
        await db.opsLead.update({
          where: { id: lead.id },
          data: { botStatus: "returned", assignedAgentId: lead.originalAgentId ?? lead.assignedAgentId, status: lead.originalAgentId ? "assigned" : "new" },
        });
        await timeline({ leadId: lead.id, type: "bot_returned", actorType: "ai_agent", title: "أعاد AI Bot العميل للموظف المسؤول الأصلي", data: { originalAgentId: lead.originalAgentId } });
      }
    } else {
      return jsonErr("invalid_action");
    }
    await audit({ actorType: "admin", actorId: ACTOR.id, action: `bot.${action}`, entityType: "bot_queue_item", entityId: item.id, source: "bot_queue" });
    return jsonOk({ ok: true, action });
  }

  // ---- merge review actions ----
  if (path[0] === "merge" && path[1] && path[2] === "action") {
    const job = await db.mergeJob.findUnique({ where: { id: path[1] } });
    if (!job) return jsonErr("merge_job_not_found", 404);
    const action = str("action");
    if (action === "merge") {
      const res = await mergeListings({
        canonicalId: job.canonicalListingId,
        duplicateId: job.duplicateListingId,
        confidence: job.confidence,
        reasons: parseJson(job.reasons, []),
        actor: ACTOR,
        auto: false,
        source: "merge_review",
      });
      await db.mergeJob.update({ where: { id: job.id }, data: { status: "merged", reviewedById: ACTOR.id, reviewedAt: new Date(), fieldChanges: JSON.stringify(res.fieldChanges) } });
      return jsonOk({ ok: true, ...res });
    }
    if (action === "reject") {
      await db.mergeJob.update({ where: { id: job.id }, data: { status: "rejected", reviewedById: ACTOR.id, reviewedAt: new Date() } });
      await daleelyListingsAdapter.updateStatus(job.duplicateListingId, "active");
      await audit({ actorType: "admin", actorId: ACTOR.id, action: "merge.rejected", entityType: "merge_job", entityId: job.id, reason: str("reason") || "رفض المطابقة بعد المراجعة", source: "merge_review" });
      return jsonOk({ ok: true, rejected: true });
    }
    if (action === "manual_review") {
      await db.mergeJob.update({ where: { id: job.id }, data: { status: "manual_review", reviewedById: ACTOR.id, reviewedAt: new Date() } });
      return jsonOk({ ok: true, manualReview: true });
    }
    return jsonErr("invalid_action");
  }

  // ---- agents management ----
  if (path[0] === "agents" && !path[1]) {
    const name = str("name");
    const role = str("role") || "sales";
    if (!name) return jsonErr("missing_name");
    const agent = await db.salesAgent.create({
      data: { name, role, rawPhone: str("phone") || null, status: "active", canReceiveLeads: role === "sales" || role === "manager" },
    });
    await audit({ actorType: "admin", actorId: ACTOR.id, action: "agent.added", entityType: "sales_agent", entityId: agent.id, newValue: { name, role }, source: "team_management" });
    return jsonOk({ ok: true, agentId: agent.id });
  }
  if (path[0] === "agents" && path[1] && path[2] === "action") {
    const agent = await db.salesAgent.findUnique({ where: { id: path[1] } });
    if (!agent) return jsonErr("agent_not_found", 404);
    const action = str("action");
    if (action === "disable") {
      await db.salesAgent.update({ where: { id: agent.id }, data: { status: "disabled", canReceiveLeads: false } });
      const reassigned = await reassignOpenLeads(agent.id, { type: "admin", id: ACTOR.id, name: ACTOR.name });
      await audit({ actorType: "admin", actorId: ACTOR.id, action: "agent.disabled", entityType: "sales_agent", entityId: agent.id, oldValue: { status: "active" }, newValue: { status: "disabled" }, reason: "history preserved, open leads reassigned", source: "team_management", metadata: { reassignedCount: reassigned.length } });
      return jsonOk({ ok: true, reassigned: reassigned.length, historyPreserved: true });
    }
    if (action === "activate") {
      await db.salesAgent.update({ where: { id: agent.id }, data: { status: "active", canReceiveLeads: agent.role === "sales" || agent.role === "manager" } });
      await audit({ actorType: "admin", actorId: ACTOR.id, action: "agent.reactivated", entityType: "sales_agent", entityId: agent.id, source: "team_management" });
      return jsonOk({ ok: true });
    }
    if (action === "set-role") {
      const role = str("role");
      await db.salesAgent.update({ where: { id: agent.id }, data: { role, canReceiveLeads: role === "sales" || role === "manager" } });
      await audit({ actorType: "admin", actorId: ACTOR.id, action: "agent.role_changed", entityType: "sales_agent", entityId: agent.id, oldValue: { role: agent.role }, newValue: { role }, source: "team_management" });
      return jsonOk({ ok: true });
    }
    if (action === "reassign-open") {
      const reassigned = await reassignOpenLeads(agent.id, { type: "admin", id: ACTOR.id, name: ACTOR.name });
      return jsonOk({ ok: true, reassigned: reassigned.length });
    }
    return jsonErr("invalid_action");
  }

  // ---- whatsapp send / simulate reply ----
  if (path[0] === "whatsapp" && path[1] === "threads" && path[2] && path[3] === "send") {
    const thread = await db.whatsAppThread.findUnique({ where: { id: path[2] } });
    if (!thread) return jsonErr("thread_not_found", 404);
    const msg = await db.whatsAppMessage.create({
      data: { threadId: thread.id, direction: "out", body: str("body"), template: str("template") || null, status: "queued", actorType: "sales_agent", actorId: ACTOR.id },
    });
    await db.whatsAppThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
    if (thread.leadId) await timeline({ leadId: thread.leadId, type: "whatsapp_sent", actorType: "sales_agent", actorName: ACTOR.name, title: "رسالة واتساب مرسلة", data: { threadId: thread.id } });
    return jsonOk({ ok: true, messageId: msg.id, demoMode: true });
  }
  if (path[0] === "whatsapp" && path[1] === "threads" && path[2] && path[3] === "simulate-reply") {
    const thread = await db.whatsAppThread.findUnique({ where: { id: path[2] } });
    if (!thread) return jsonErr("thread_not_found", 404);
    const msg = await db.whatsAppMessage.create({
      data: { threadId: thread.id, direction: "in", body: str("body") || "تمام، وصلتني الرسالة — شكرًا لكم", status: "received", actorType: "customer" },
    });
    await db.whatsAppThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date(), unreadCount: thread.unreadCount + 1 } });
    if (thread.leadId) await timeline({ leadId: thread.leadId, type: "whatsapp_received", actorType: "customer", title: "رد العميل على واتساب", data: { threadId: thread.id } });
    return jsonOk({ ok: true, messageId: msg.id, demoMode: true });
  }

  // ---- notifications read ----
  if (path[0] === "notifications" && path[1] === "read") {
    if (str("scope") === "all") {
      await db.opsNotification.updateMany({ data: { read: true } });
    } else if (Array.isArray(body.ids)) {
      await db.opsNotification.updateMany({ where: { id: { in: body.ids as string[] } }, data: { read: true } });
    }
    return jsonOk({ ok: true });
  }

  return jsonErr("unknown_route:" + path.join("/"), 404);
}
