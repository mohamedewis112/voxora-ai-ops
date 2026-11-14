/**
 * Asterisk/self-hosted telephony provider.
 * Browser code talks only to Voxora's server-side /api/telephony/bridge route;
 * Asterisk credentials and backend URLs are never exposed to the client.
 */
import type { TranscriptLine } from "@/lib/types";
import { useAgentStore } from "@/stores/agent-store";
import type { StartCallTarget, TelephonyProvider } from "./index";

type BridgeResponse<T = unknown> = { ok: boolean; data?: T; error?: string };

async function bridge<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch("/api/telephony/bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const j = await r.json() as BridgeResponse<T>;
  if (!r.ok || !j.ok) throw new Error(j.error || `telephony_${action}_failed`);
  return (j.data ?? {}) as T;
}

class AsteriskTelephonyProvider implements TelephonyProvider {
  readonly name = "asterisk";
  readonly isSimulation = false;

  async startAgent(): Promise<void> {
    await bridge("start_agent");
    useAgentStore.getState().setStatus("ready");
  }
  async pauseAgent(): Promise<void> {
    await bridge("pause_agent");
    useAgentStore.getState().setStatus("paused");
  }
  async stopAgent(): Promise<void> {
    await bridge("stop_agent");
    useAgentStore.getState().setStatus("offline");
  }
  async getAgentStatus(): Promise<string> {
    const out = await bridge<{ status?: string }>("status");
    return out.status || "offline";
  }
  async startCall(target: StartCallTarget): Promise<{ callId: string }> {
    const out = await bridge<{ callId?: string; id?: string }>("start_call", { target });
    const callId = out.callId || out.id;
    if (!callId) throw new Error("telephony_missing_call_id");
    return { callId };
  }
  async endCall(callId: string): Promise<void> {
    await bridge("end_call", { callId });
  }
  async transferCall(callId: string, destination: string): Promise<void> {
    await bridge("transfer_call", { callId, destination });
  }
  async getCallTranscript(callId: string): Promise<TranscriptLine[]> {
    const out = await bridge<{ transcript?: TranscriptLine[] } | TranscriptLine[]>("transcript", { callId });
    return Array.isArray(out) ? out : out.transcript ?? [];
  }
  async getCallRecording(callId: string): Promise<{ url: string } | null> {
    const out = await bridge<{ url?: string }>("recording", { callId });
    return out.url ? { url: out.url } : null;
  }
}

export const asteriskProvider = new AsteriskTelephonyProvider();
