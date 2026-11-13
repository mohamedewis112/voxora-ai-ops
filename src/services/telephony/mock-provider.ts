/**
 * ⚠️  MOCK TELEPHONY PROVIDER — DEVELOPMENT ONLY
 * ==============================================
 * Simulates the full call lifecycle in the browser so the dashboard can be
 * demoed end-to-end without a backend. It NEVER places real calls.
 *
 * Flow: ready → dial from queue → ringing → answered → (speaking ⇄ listening
 * with streamed transcript) → completed/failed → back to ready → next contact.
 *
 * Replace this file with a real implementation (Asterisk ARI) — the interface
 * in ./index.ts and the UI stay untouched.
 */

import { toast } from "sonner";
import type { Call, CallOutcome, TranscriptLine, Lead } from "@/lib/types";
import { uid } from "@/lib/types";
import { simScriptFor, type SimScript } from "@/lib/demo-data";
import { useDataStore } from "@/stores/data-store";
import { useAgentStore } from "@/stores/agent-store";
import { realtime } from "@/services/realtime";
import type { StartCallTarget, TelephonyProvider } from "./index";

const OUTCOME_WEIGHTS: Array<[CallOutcome, number]> = [
  ["interested", 0.4],
  ["callback", 0.24],
  ["not_interested", 0.18],
  ["transferred", 0.08],
  ["info", 0.06],
  ["sale", 0.04],
];

function weightedOutcome(): CallOutcome {
  const r = Math.random();
  let acc = 0;
  for (const [outcome, w] of OUTCOME_WEIGHTS) {
    acc += w;
    if (r <= acc) return outcome;
  }
  return "interested";
}

class MockTelephonyProvider implements TelephonyProvider {
  readonly name = "mock";
  readonly isSimulation = true;

  private timers: ReturnType<typeof setTimeout>[] = [];
  private ticker: ReturnType<typeof setInterval> | null = null;
  private speaking = false;

  /* ------------------------------- lifecycle ------------------------------- */

  async startAgent() {
    this.clearAll();
    useAgentStore.getState().setPauseQueued(false);
    useAgentStore.getState().setStatus("ready");
    toast.success("تم تشغيل الإيجنت — سيبدأ الاتصال من قائمة الانتظار");
    this.schedule(() => this.dialNext(), 2200);
  }

  async pauseAgent() {
    const agent = useAgentStore.getState();
    if (agent.currentCall) {
      agent.setPauseQueued(true);
      toast.info("سيتم الإيقاف مؤقتًا بعد انتهاء المكالمة الحالية");
    } else {
      agent.setStatus("paused");
      toast.info("تم إيقاف الإيجنت مؤقتًا");
    }
  }

  async stopAgent() {
    const agent = useAgentStore.getState();
    this.clearAll();
    if (agent.currentCall) {
      this.finalizeCurrent("completed", { outcome: "none", status: "answered", endedByUser: true });
    }
    agent.setStatus("offline");
    toast.info("تم إيقاف الإيجنت");
  }

  async getAgentStatus() {
    return useAgentStore.getState().status;
  }

  /* --------------------------------- calls --------------------------------- */

  async startCall(target: StartCallTarget) {
    const agent = useAgentStore.getState();
    if (agent.currentCall) {
      toast.error("هناك مكالمة جارية بالفعل — انتظر انتهائها أولًا");
      throw new Error("call already active");
    }
    const callId = uid("call");
    agent.setPauseQueued(false);
    agent.setCurrentCall({
      id: callId,
      contactId: target.id,
      name: target.name,
      phone: target.phone,
      campaignId: target.campaignId ?? null,
      transcript: [],
      startedAt: new Date().toISOString(),
      durationSec: 0,
    });
    agent.setStatus("calling");
    realtime.emit("call.started", { target: target.name }, callId);

    this.schedule(() => {
      if (useAgentStore.getState().status !== "calling") return;
      realtime.emit("call.ringing", undefined, callId);
    }, 1500);

    this.schedule(() => {
      if (useAgentStore.getState().status !== "calling") return;
      // 15% of simulated calls go unanswered / busy
      if (Math.random() < 0.15) {
        const failedStatus: Call["status"] = Math.random() < 0.6 ? "no_answer" : "busy";
        this.finalizeCurrent("completed", { outcome: "none", status: failedStatus });
      } else {
        this.beginConversation();
      }
    }, 3400);

    return { callId };
  }

  async endCall() {
    this.clearConversation();
    this.finalizeCurrent("completed", { endedByUser: true });
  }

  async transferCall(_callId: string, destination: string) {
    const s = useDataStore.getState();
    const dest =
      destination === "sales" ? s.settings.transfer.salesPhone
      : destination === "support" ? s.settings.transfer.supportPhone
      : s.settings.transfer.fallbackPhone;
    useAgentStore.getState().pushTranscriptLine({
      id: uid("tl"),
      speaker: "system",
      text: `تم تحويل المكالمة لموظف (${destination}): ${dest}`,
      atSec: useAgentStore.getState().currentCall?.durationSec ?? 0,
    });
    realtime.emit("call.transferred", { destination }, useAgentStore.getState().currentCall?.id);
    this.clearConversation();
    this.finalizeCurrent("completed", { outcome: "transferred", status: "answered" });
  }

  async getCallTranscript(callId: string): Promise<TranscriptLine[]> {
    return useDataStore.getState().calls.find((c) => c.id === callId)?.transcript ?? [];
  }

  async getCallRecording() {
    // Recording playback arrives with the real backend (Asterisk monitor / MixMonitor).
    return null;
  }

  /* ----------------------------- internal engine ---------------------------- */

  private schedule(fn: () => void, ms: number) {
    const t = setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== t);
      fn();
    }, ms);
    this.timers.push(t);
  }

  private clearAll() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.clearTicker();
    this.speaking = false;
  }

  private clearTicker() {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  /** Pick the next waiting contact from the queue and dial. */
  private dialNext() {
    const ds = useDataStore.getState();
    const agent = useAgentStore.getState();
    if (agent.status !== "ready" && agent.status !== "completed") return;
    if (agent.currentCall) return;

    const next = ds.queue.find((q) => q.status === "waiting");
    if (!next) return; // stay ready, nothing to dial

    // Safety: skip do-not-call contacts (they should never reach the queue).
    const contact = ds.contacts.find((c) => c.id === next.contactId);
    if (!contact || contact.status === "dnd" || contact.status === "wrong_number") {
      ds.updateQueueItem(next.id, { status: "canceled" });
      this.dialNext();
      return;
    }

    void this.startCall({ id: contact.id, name: contact.name, phone: contact.phone, campaignId: next.campaignId })
      .then(() => ds.updateQueueItem(next.id, { status: "calling", attempts: next.attempts + 1 }))
      .catch(() => undefined);
  }

  /** Start streaming a simulated conversation line by line. */
  private beginConversation() {
    const agent = useAgentStore.getState();
    const outcome = weightedOutcome();
    const script = simScriptFor(outcome);
    agent.setStatus("connected");
    realtime.emit("call.answered", undefined, agent.currentCall?.id);

    this.clearTicker();
    this.ticker = setInterval(() => {
      const cur = useAgentStore.getState().currentCall;
      if (!cur) return;
      useAgentStore.getState().updateCurrentCall({ durationSec: cur.durationSec + 1 });
    }, 1000);

    let idx = 0;
    const step = () => {
      const cur = useAgentStore.getState().currentCall;
      if (!cur) return; // stopped mid-call
      const line = script.lines[idx];
      if (!line) {
        this.finishConversation(script, "completed");
        return;
      }
      useAgentStore.getState().setStatus(line.speaker === "agent" ? "speaking" : line.speaker === "system" ? "processing" : "listening");
      realtime.emit(line.speaker === "agent" ? "agent.speaking" : "agent.thinking", { line: idx }, cur.id);
      useAgentStore.getState().pushTranscriptLine(line);
      idx += 1;
      this.schedule(step, line.speaker === "system" ? 1400 : 2400 + Math.random() * 900);
    };
    step();
  }

  private clearConversation() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.clearTicker();
    this.speaking = false;
  }

  private finishConversation(script: SimScript, reason: "completed" | "failed") {
    this.clearConversation();
    const cur = useAgentStore.getState().currentCall;
    const contact = cur?.contactId ? useDataStore.getState().contacts.find((c) => c.id === cur.contactId) : null;
    const repl = (s: string) =>
      s.split("{name}").join(cur?.name ?? "").split("{business}").join(contact?.business ?? "");
    this.finalizeCurrent(reason, {
      outcome: script.outcome,
      status: script.status,
      score: script.score,
      sentiment: script.sentiment,
      summary: repl(script.summary),
      aiNotes: repl(script.aiNotes),
      followUpAction: repl(script.followUpAction),
      extracted: script.extracted.map(repl),
      objection: script.objection,
    });
  }

  /** Persist the call, update CRM entities and return the agent to ready. */
  private finalizeCurrent(
    _reason: "completed" | "failed",
    opts: {
      outcome?: CallOutcome;
      status?: Call["status"];
      score?: number;
      sentiment?: Call["sentiment"];
      summary?: string;
      aiNotes?: string;
      followUpAction?: string;
      extracted?: string[];
      objection?: string;
      endedByUser?: boolean;
    }
  ) {
    this.clearConversation();
    const agent = useAgentStore.getState();
    const ds = useDataStore.getState();
    const cur = agent.currentCall;
    if (!cur) return;

    const outcome = opts.outcome ?? "none";
    const status = opts.status ?? "answered";
    const answered = status === "answered";
    const endedByUser = opts.endedByUser === true && outcome === "none" && cur.transcript.length > 0;

    const call: Call = {
      id: cur.id,
      contactId: cur.contactId,
      contactName: cur.name,
      phone: cur.phone,
      direction: "outbound",
      campaignId: cur.campaignId,
      agentId: "agent_1",
      startedAt: cur.startedAt,
      durationSec: cur.durationSec,
      status,
      outcome: answered ? (endedByUser ? "info" : outcome) : "none",
      leadScore: answered ? (opts.score ?? 0) : 0,
      sentiment: answered ? (opts.sentiment ?? "neutral") : "neutral",
      summary: endedByUser
        ? `مكالمة مع ${cur.name} تم إنهاؤها يدويًا من لوحة التحكم أثناء المحادثة.`
        : (opts.summary ?? "لم يتم إتمام الاتصال بالعميل."),
      aiNotes: opts.aiNotes ?? "لم يتم الرد — سيتم إعادة المحاولة وفق سياسة الحملة.",
      followUpAction: opts.followUpAction ?? "إعادة محاولة تلقائية",
      extracted: opts.extracted ?? [],
      transcript: cur.transcript,
      recordingStatus: answered ? "pending" : "unavailable",
      objection: opts.objection,
    };
    ds.upsertCall(call);
    realtime.emit(answered ? "call.completed" : "call.failed", { outcome }, call.id);

    /* CRM side effects */
    const contact = cur.contactId ? ds.contacts.find((c) => c.id === cur.contactId) : null;
    if (contact) {
      const patch: Partial<typeof contact> = {
        lastCallAt: call.startedAt,
      };
      if (outcome === "callback") {
        patch.nextFollowUpAt = new Date(Date.now() + 20 * 3600_000).toISOString();
        ds.addFollowUp({
          contactId: contact.id,
          name: contact.name,
          phone: contact.phone,
          reason: "اتصال لاحق — طلبه العميل خلال المكالمة",
          dueAt: new Date(Date.now() + 20 * 3600_000).toISOString(),
          campaignId: cur.campaignId,
          callId: call.id,
        });
      }
      if (outcome === "not_interested") patch.status = "active";
      ds.updateContact(contact.id, patch);

      /* Lead pipeline update */
      const existing = ds.leads.find((l) => l.contactId === contact.id);
      const stageFor: Record<string, Lead["stage"]> = {
        interested: "interested",
        transferred: "transferred",
        sale: "won",
        callback: "followup",
        not_interested: "lost",
        info: "contacted",
        none: "contacted",
      };
      const nextStage = stageFor[outcome];
      if (answered && nextStage) {
        if (existing) {
          ds.updateLead(existing.id, {
            stage: nextStage,
            score: Math.max(existing.score, call.leadScore),
            lastCallAt: call.startedAt,
            nextAction: call.followUpAction,
          });
        } else {
          ds.addLead({
            contactId: contact.id,
            name: contact.name,
            phone: contact.phone,
            business: contact.business,
            stage: nextStage,
            score: call.leadScore,
            lastCallAt: call.startedAt,
            nextAction: call.followUpAction,
            campaignId: cur.campaignId,
          });
        }
      }
    }

    /* Queue bookkeeping */
    if (cur.contactId) {
      const item = ds.queue.find((q) => q.contactId === cur.contactId && q.status === "calling");
      if (item) ds.updateQueueItem(item.id, { status: "done" });
    }

    agent.setCurrentCall(null);
    agent.setLastFinished({ name: cur.name, outcome, at: Date.now() });

    if (outcome === "transferred") {
      agent.setStatus("transferred");
      toast.success(`تم تحويل مكالمة ${cur.name} لموظف المبيعات`);
    } else if (answered) {
      agent.setStatus("completed");
      toast.success(`اكتملت مكالمة ${cur.name}`);
    } else {
      agent.setStatus("failed");
      toast.warning(`لم يتم الرد — ${cur.name}`);
    }

    /* Back to ready and dial next (unless paused/queued-pause). */
    this.schedule(() => {
      const a = useAgentStore.getState();
      if (a.status !== "completed" && a.status !== "transferred" && a.status !== "failed") return;
      if (a.pauseQueued) {
        a.setStatus("paused");
        a.setPauseQueued(false);
        toast.info("تم إيقاف الإيجنت مؤقتًا");
        return;
      }
      a.setStatus("ready");
      this.schedule(() => this.dialNext(), 2500);
    }, 1600);
  }
}

export const mockProvider = new MockTelephonyProvider();
