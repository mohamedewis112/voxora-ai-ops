/**
 * Telephony abstraction layer
 * ===========================
 * The ONLY interface the UI is allowed to talk to for anything call-related.
 * The frontend must never depend on Twilio/Vapi/Retell or any paid vendor —
 * only on this contract, implemented by:
 *
 *  - MockTelephonyProvider  → in-browser simulation for development (default)
 *  - AsteriskTelephonyProvider → real Voxora server bridge for the self-hosted stack
 *    (Asterisk ARI + Whisper.cpp + local LLM + local Arabic TTS)
 *
 * Integration point: implement `TelephonyProvider` against your backend and
 * flip `settings.telephony.provider` — zero UI changes required.
 */

import type { TranscriptLine } from "@/lib/types";
import { useDataStore } from "@/stores/data-store";
import { mockProvider } from "./mock-provider";
import { asteriskProvider } from "./asterisk-provider";

export interface StartCallTarget {
  id: string;
  name: string;
  phone: string;
  campaignId?: string | null;
}

export interface TelephonyProvider {
  readonly name: string;
  readonly isSimulation: boolean;

  /** Bring the agent online (status → ready, then auto-dial from queue). */
  startAgent(): Promise<void>;
  /** Pause between calls; a running call finishes gracefully first. */
  pauseAgent(): Promise<void>;
  /** Take the agent offline immediately; any live call is ended. */
  stopAgent(): Promise<void>;

  getAgentStatus(): Promise<string>;

  /** Originate a call to a contact (used by queue + "call now" buttons). */
  startCall(target: StartCallTarget): Promise<{ callId: string }>;
  endCall(callId: string): Promise<void>;
  /** Bridge the live call to a human destination (sales/support/fallback). */
  transferCall(callId: string, destination: string): Promise<void>;

  getCallTranscript(callId: string): Promise<TranscriptLine[]>;
  getCallRecording(callId: string): Promise<{ url: string } | null>;
}

export function getTelephony(): TelephonyProvider {
  const { provider } = useDataStore.getState().settings.telephony;
  return provider === "asterisk" ? asteriskProvider : mockProvider;
}


