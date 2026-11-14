/**
 * Live agent runtime state.
 * Written exclusively by the active TelephonyProvider (mock simulation in local development,
 * real Asterisk events tomorrow) — components only read from here.
 */

import { create } from "zustand";
import type { AgentStatus, CallOutcome, TranscriptLine } from "@/lib/types";

export interface LiveCall {
  id: string;
  contactId: string | null;
  name: string;
  phone: string;
  campaignId: string | null;
  transcript: TranscriptLine[];
  startedAt: string;
  durationSec: number;
}

interface AgentRuntimeState {
  status: AgentStatus;
  currentCall: LiveCall | null;
  /** Last finished call — used by the dashboard to flash the outcome. */
  lastFinished: { name: string; outcome: CallOutcome; at: number } | null;
  pauseQueued: boolean;
  setStatus: (s: AgentStatus) => void;
  setCurrentCall: (c: LiveCall | null) => void;
  updateCurrentCall: (patch: Partial<LiveCall>) => void;
  pushTranscriptLine: (line: TranscriptLine) => void;
  setLastFinished: (f: { name: string; outcome: CallOutcome; at: number } | null) => void;
  setPauseQueued: (v: boolean) => void;
}

export const useAgentStore = create<AgentRuntimeState>()((set) => ({
  status: "offline",
  currentCall: null,
  lastFinished: null,
  pauseQueued: false,
  setStatus: (status) => set({ status }),
  setCurrentCall: (currentCall) => set({ currentCall }),
  updateCurrentCall: (patch) =>
    set((s) => ({ currentCall: s.currentCall ? { ...s.currentCall, ...patch } : null })),
  pushTranscriptLine: (line) =>
    set((s) => ({ currentCall: s.currentCall ? { ...s.currentCall, transcript: [...s.currentCall.transcript, line] } : null })),
  setLastFinished: (lastFinished) => set({ lastFinished }),
  setPauseQueued: (pauseQueued) => set({ pauseQueued }),
}));
