/**
 * Voxora AI — audit trail, unified timeline and notifications helpers.
 * EVERY important operation calls `audit()`. No silent destructive changes.
 */
import { db } from "@/lib/db";

export interface AuditInput {
  actorType: "admin" | "sales_agent" | "ai_agent" | "system" | "customer";
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
}

export function audit(input: AuditInput) {
  return db.auditLog.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      oldValue: JSON.stringify(input.oldValue ?? {}),
      newValue: JSON.stringify(input.newValue ?? {}),
      reason: input.reason ?? null,
      source: input.source ?? null,
      metadata: JSON.stringify(input.metadata ?? {}),
    },
  });
}

export interface TimelineInput {
  leadId: string;
  type: string;
  actorType?: AuditInput["actorType"];
  actorId?: string | null;
  actorName?: string | null;
  title: string;
  data?: Record<string, unknown>;
}

export function timeline(input: TimelineInput) {
  return db.timelineEvent.create({
    data: {
      leadId: input.leadId,
      type: input.type,
      actorType: input.actorType ?? "system",
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
      title: input.title,
      data: JSON.stringify(input.data ?? {}),
    },
  });
}

/** Multiple timeline entries in order. */
export async function timelineMany(leadId: string, events: Omit<TimelineInput, "leadId">[]) {
  for (const e of events) await timeline({ leadId, ...e });
}

export function notify(input: {
  targetUserId?: string | null;
  targetPhone?: string | null;
  title: string;
  body: string;
  type?: "info" | "success" | "warning" | "error";
  leadId?: string | null;
}) {
  return db.opsNotification.create({
    data: {
      targetUserId: input.targetUserId ?? null,
      targetPhone: input.targetPhone ?? null,
      title: input.title,
      body: input.body,
      type: input.type ?? "info",
      leadId: input.leadId ?? null,
    },
  });
}

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}
