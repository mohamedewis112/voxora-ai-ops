/**
 * DALEELY INTEGRATION BOUNDARY — sales sync adapter.
 * Keeps the Daleely side informed about ops lead lifecycle (optional webhooks /
 * RPCs in production). Voxora core calls ONLY this adapter — never Daleely direct.
 * Daleely MUST keep operating normally even if Voxora AI is offline: every call
 * here is best-effort and must never block Daleely frontend requests.
 */
import { db } from "@/lib/db";

export const daleelySalesSyncAdapter = {
  /** Fire-and-forget: lead created/assigned. */
  async leadCreated(payload: { leadId: string; normalizedPhone: string; agentId: string | null }) {
    // Production: POST to Daleely webhook / supabase.rpc('ops_lead_created', ...)
    await db.auditLog.create({
      data: {
        actorType: "system",
        action: "sales_sync.lead_created",
        entityType: "lead",
        entityId: payload.leadId,
        newValue: JSON.stringify(payload),
        source: "daleely_sales_sync",
      },
    });
  },
  /** Fire-and-forget: lead status changed. */
  async leadStatusChanged(payload: { leadId: string; from: string; to: string }) {
    await db.auditLog.create({
      data: {
        actorType: "system",
        action: "sales_sync.lead_status_changed",
        entityType: "lead",
        entityId: payload.leadId,
        oldValue: JSON.stringify({ status: payload.from }),
        newValue: JSON.stringify({ status: payload.to }),
        source: "daleely_sales_sync",
      },
    });
  },
};
