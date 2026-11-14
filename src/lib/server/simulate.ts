/**
 * Voxora AI — demo simulators (CLEARLY LABELED, no real telephony/WhatsApp).
 * - Bot queue: lazy processing — when a "running" item is older than 8s the next
 *   poll completes it with a simulated AI outcome (CallAttempt agentType=ai_agent).
 * - WhatsApp: lazy status progression queued → sent → delivered → read.
 * In production these are replaced by real telephony events / WhatsApp Cloud API
 * webhooks via the adapters — same data shapes, zero UI changes.
 */
import { db } from "@/lib/db";
import { audit, timeline } from "./audit";

async function timelineMany(
  leadId: string,
  events: { type: string; actorType?: "admin" | "sales_agent" | "ai_agent" | "system" | "customer"; title: string; data?: Record<string, unknown> }[]
) {
  for (const e of events) await timeline({ leadId, ...e });
}

const BOT_RUN_SECONDS = 8;

/** Deterministic pseudo-random from string id (stable outcomes for tests). */
function seededPercent(id: string, salt: string): number {
  let h = 0;
  const s = id + salt;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 100;
}

export async function processBotQueue(): Promise<{ completed: string[] }> {
  const running = await db.botQueueItem.findMany({ where: { status: "running" } });
  const completed: string[] = [];
  const now = Date.now();

  for (const item of running) {
    const started = item.startedAt?.getTime() ?? 0;
    if (now - started < BOT_RUN_SECONDS * 1000) continue;

    const lead = await db.opsLead.findUnique({ where: { id: item.leadId } });
    if (!lead) continue;

    const p = seededPercent(item.id, "bot");
    let outcome: string;
    if (p < 55) outcome = "answered";
    else if (p < 70) outcome = "busy";
    else if (p < 85) outcome = "no_answer";
    else outcome = "switched_off";

    let leadStatus = lead.status;
    let lastResult = "";

    if (outcome === "answered") {
      const p2 = seededPercent(item.id, "result");
      if (p2 < 45) {
        leadStatus = "interested";
        lastResult = "AI: تم الرد — العميل مهتم";
      } else if (p2 < 75) {
        leadStatus = "callback";
        lastResult = "AI: تم الرد — طلب رجوع لاحقًا";
      } else {
        leadStatus = "not_interested";
        lastResult = "AI: تم الرد — غير مهتم حاليًا";
      }
      await db.opsCallAttempt.create({
        data: {
          leadId: lead.id,
          agentType: "ai_agent",
          agentId: null,
          outcome: p2 < 45 ? "interested" : p2 < 75 ? "callback" : "not_interested",
          confidence: 60 + (p2 % 30),
          durationSec: 90 + (p2 % 180),
          startedAt: new Date(started),
          endedAt: new Date(),
          notes: "محاكاة اتصال AI Bot (وضع تجريبي — بدون اتصال حقيقي)",
        },
      });
    } else {
      leadStatus = outcome;
      lastResult = `AI: ${outcome === "busy" ? "خط مشغول" : outcome === "no_answer" ? "لم يجب" : "الجهاز مغلق"}`;
      await db.opsCallAttempt.create({
        data: {
          leadId: lead.id,
          agentType: "ai_agent",
          outcome,
          durationSec: 0,
          startedAt: new Date(started),
          endedAt: new Date(),
          notes: "محاكاة اتصال AI Bot (وضع تجريبي — بدون اتصال حقيقي)",
        },
      });
    }

    await db.botQueueItem.update({
      where: { id: item.id },
      data: { status: "done", attempts: item.attempts + 1, lastResult, finishedAt: new Date() },
    });
    await db.opsLead.update({
      where: { id: lead.id },
      data: { status: leadStatus, botStatus: "done", lastOutcome: outcome, updatedAt: new Date() },
    });

    await timelineMany(lead.id, [
      { type: "bot_started", actorType: "ai_agent", title: "بدأ AI Bot الاتصال بالعميل (محاكاة)", data: { queueItemId: item.id } },
      { type: "bot_result", actorType: "ai_agent", title: lastResult, data: { outcome } },
    ]);
    await audit({
      actorType: "ai_agent",
      action: "bot.completed",
      entityType: "lead",
      entityId: lead.id,
      newValue: { outcome, lastResult },
      source: "bot_queue",
      metadata: { queueItemId: item.id, simulation: true },
    });
    completed.push(item.id);
  }
  return { completed };
}

const WA_QUEUED_MS = 1500;
const WA_SENT_MS = 3500;
const WA_DELIVERED_MS = 7000;

export async function advanceWhatsAppStatuses(): Promise<void> {
  const now = Date.now();
  const messages = await db.whatsAppMessage.findMany({
    where: { direction: "out", status: { in: ["queued", "sent", "delivered"] } },
  });
  for (const m of messages) {
    const created = m.createdAt.getTime();
    if (m.status === "queued" && now - created > WA_QUEUED_MS) {
      await db.whatsAppMessage.update({
        where: { id: m.id },
        data: { status: "sent", sentAt: new Date() },
      });
    } else if (m.status === "sent" && now - created > WA_SENT_MS) {
      await db.whatsAppMessage.update({
        where: { id: m.id },
        data: { status: "delivered", deliveredAt: new Date() },
      });
    } else if (m.status === "delivered" && now - created > WA_DELIVERED_MS) {
      await db.whatsAppMessage.update({
        where: { id: m.id },
        data: { status: "read", readAt: new Date() },
      });
      // A read follow-up sometimes gets a customer reply (demo simulation)
      const p = seededPercent(m.id, "reply");
      if (p < 40) {
        await db.whatsAppMessage.create({
          data: {
            threadId: m.threadId,
            direction: "in",
            body: "تمام، شكرًا لكم — هراجع التفاصيل وأرد عليكم",
            status: "received",
            actorType: "customer",
          },
        });
        const thread = await db.whatsAppThread.findUnique({ where: { id: m.threadId } });
        if (thread) {
          await db.whatsAppThread.update({
            where: { id: thread.id },
            data: { unreadCount: thread.unreadCount + 1, lastMessageAt: new Date() },
          });
          if (thread.leadId) {
            await timeline({
              leadId: thread.leadId,
              type: "whatsapp_received",
              actorType: "customer",
              title: "رد العميل على متابعة واتساب",
            });
          }
        }
      }
    }
  }
}
