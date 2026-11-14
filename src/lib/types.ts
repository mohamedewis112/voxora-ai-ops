/**
 * Voxora AI — Domain types
 * ----------------------------
 * Frontend-only domain model. Shapes are intentionally Supabase-compatible:
 * every entity maps 1:1 to a future `supabase/schema.sql` table (see /docs).
 * Arrays that will become FK tables in the DB are typed as arrays here and
 * rendered as JSON columns in the local Prisma schema for parity.
 */

export type Lang = "ar" | "en";

/* ---------------------------------- Auth ---------------------------------- */

export type Role = "admin" | "manager" | "sales_agent" | "viewer";

export interface Account {
  name: string;
  email: string;
  role: Role;
}

/* --------------------------------- Agent ---------------------------------- */

export type AgentType =
  | "customer_service"
  | "sales"
  | "followup"
  | "appointments"
  | "custom";

export type AgentLanguage = "ar_eg" | "ar_gulf" | "ar_msa" | "en";

export type AgentPersonality =
  | "professional"
  | "friendly"
  | "formal"
  | "sales_focused"
  | "service_focused";

/** Full lifecycle of a live agent session (realtime events drive these). */
export type AgentStatus =
  | "offline"
  | "ready"
  | "paused"
  | "calling"
  | "connected"
  | "speaking"
  | "listening"
  | "processing"
  | "transferred"
  | "completed"
  | "failed";

export interface FlowCondition {
  id: string;
  /** When the customer says / does this… */
  when: string;
  /** …then the agent performs this action. */
  then: string;
}

export type FlowStepKind =
  | "start"
  | "message"
  | "question"
  | "condition"
  | "action"
  | "transfer"
  | "end";

export interface FlowStep {
  id: string;
  kind: FlowStepKind;
  title: string;
  prompt?: string;
  conditions?: FlowCondition[];
}

export interface AgentConfig {
  id: string;
  name: string;
  jobTitle: string;
  type: AgentType;
  language: AgentLanguage;
  personality: AgentPersonality;
  /** Voice model id — resolved later by the local TTS engine. */
  voice: string;
  greeting: string;
  closing: string;
  objectionHandling: string;
  /** When to transfer to a human (free-text policy). */
  transferWhen: string;
  maxDurationMin: number;
  /** Information the agent is allowed to collect. */
  collectInfo: string[];
  /** Hard prohibitions. */
  neverSay: string[];
  systemPrompt: string;
  flow: FlowStep[];
}

/* -------------------------------- Contacts -------------------------------- */

export type ContactStatus = "active" | "dnd" | "archived" | "wrong_number";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  business: string;
  category: string;
  city: string;
  area: string;
  source: string;
  status: ContactStatus;
  tags: string[];
  campaignId: string | null;
  lastCallAt: string | null;
  nextFollowUpAt: string | null;
  notes: string;
  createdAt: string;
}

/* -------------------------------- Campaigns ------------------------------- */

export type CampaignStatus = "draft" | "scheduled" | "running" | "paused" | "completed";

export type CampaignCallType =
  | "outbound_sales"
  | "customer_service"
  | "followup"
  | "appointments"
  | "survey";

export interface Campaign {
  id: string;
  name: string;
  purpose: string;
  callType: CampaignCallType;
  startDate: string;
  /** Allowed calling window (24h "HH:MM"). */
  timeFrom: string;
  timeTo: string;
  maxCallsPerDay: number;
  retryAttempts: number;
  retryDelayHours: number;
  agentId: string;
  knowledgeIds: string[];
  status: CampaignStatus;
  createdAt: string;
}

/* ---------------------------------- Calls --------------------------------- */

export type CallDirection = "outbound" | "inbound";

/** Connectivity result of the call itself. */
export type CallStatus = "answered" | "no_answer" | "busy" | "wrong_number" | "failed";

/** Business outcome of the conversation. */
export type CallOutcome =
  | "interested"
  | "not_interested"
  | "callback"
  | "transferred"
  | "sale"
  | "info"
  | "none";

export type Sentiment = "positive" | "neutral" | "negative";

export interface TranscriptLine {
  id: string;
  speaker: "agent" | "customer" | "system";
  text: string;
  atSec: number;
}

export interface Call {
  id: string;
  contactId: string | null;
  contactName: string;
  phone: string;
  direction: CallDirection;
  campaignId: string | null;
  agentId: string;
  startedAt: string;
  durationSec: number;
  status: CallStatus;
  outcome: CallOutcome;
  leadScore: number;
  sentiment: Sentiment;
  summary: string;
  aiNotes: string;
  followUpAction: string;
  /** Key facts extracted from the conversation. */
  extracted: string[];
  transcript: TranscriptLine[];
  /** Recording availability — filled by the telephony backend later. */
  recordingStatus: "available" | "pending" | "unavailable";
  /** Reason for rejection (analytics: top objections). */
  objection?: string;
}

/* ---------------------------------- Leads --------------------------------- */

export type LeadStage =
  | "new"
  | "contacted"
  | "interested"
  | "followup"
  | "ready_to_close"
  | "transferred"
  | "won"
  | "lost";

export interface Lead {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  business: string;
  stage: LeadStage;
  score: number;
  lastCallAt: string | null;
  nextAction: string;
  campaignId: string | null;
}

/* -------------------------------- Follow-ups ------------------------------ */

export type FollowUpStatus = "pending" | "done" | "postponed" | "canceled";

export interface FollowUp {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  reason: string;
  dueAt: string;
  campaignId: string | null;
  status: FollowUpStatus;
  callId: string | null;
}

/* ------------------------------ Knowledge base ---------------------------- */

export type KBType = "text" | "faq" | "file";

export interface KBQuestion {
  id: string;
  q: string;
  a: string;
}

export interface KBItem {
  id: string;
  title: string;
  category: string;
  type: KBType;
  content: string;
  faq: KBQuestion[];
  fileName: string | null;
  tags: string[];
  updatedAt: string;
  active: boolean;
}

/* -------------------------------- Call queue ------------------------------ */

export type QueueItemStatus = "waiting" | "calling" | "paused" | "done" | "canceled";
export type QueuePriority = "high" | "normal" | "low";

export interface QueueItem {
  id: string;
  contactId: string;
  name: string;
  phone: string;
  campaignId: string;
  attempts: number;
  priority: QueuePriority;
  scheduledAt: string;
  status: QueueItemStatus;
}

/* -------------------------------- Settings -------------------------------- */

export interface TransferRule {
  id: string;
  condition: string;
  destination: "sales" | "support" | "fallback";
}

export interface AppSettings {
  general: {
    appName: string;
    timezone: string;
  };
  /** Generic endpoints for the future self-hosted telephony backend (Asterisk). */
  telephony: {
    provider: "mock" | "asterisk";
    backendUrl: string;
    wsUrl: string;
    apiUrl: string;
    apiSecret: string;
    statusEndpoint: string;
    callEndpoint: string;
    hangupEndpoint: string;
    transferEndpoint: string;
  };
  aiModels: {
    provider: "ollama" | "custom";
    baseUrl: string;
    model: string;
    temperature: number;
    maxTokens: number;
  };
  stt: {
    provider: "whisper_cpp" | "vosk" | "custom";
    baseUrl: string;
    model: string;
    language: string;
  };
  tts: {
    provider: "local" | "custom";
    baseUrl: string;
    voice: string;
    speed: number;
  };
  database: {
    supabaseUrl: string;
    supabaseAnonKey: string;
  };
  transfer: {
    supportPhone: string;
    salesPhone: string;
    fallbackPhone: string;
    rules: TransferRule[];
  };
  security: {
    sessionTimeoutMin: number;
    require2fa: boolean;
  };
  notifications: {
    onCallCompleted: boolean;
    onLeadTransferred: boolean;
    onFollowUpDue: boolean;
    dailySummary: boolean;
  };
}

/* ------------------------------ Realtime events --------------------------- */

export type RealtimeEventName =
  | "call.started"
  | "call.ringing"
  | "call.answered"
  | "agent.listening"
  | "agent.thinking"
  | "agent.speaking"
  | "call.transferred"
  | "call.completed"
  | "call.failed";

export interface RealtimeEvent {
  name: RealtimeEventName;
  callId?: string;
  payload?: Record<string, unknown>;
  at: string;
}

/* --------------------------------- Helpers -------------------------------- */

export const uid = (prefix = "id"): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

/** Egyptian mobile sanity check (also accepts spaces/dashes). */
export function isValidEgyptianPhone(raw: string): boolean {
  const digits = raw.replace(/[\s\-()+]/g, "").replace(/^\+?20/, "0");
  return /^01[0125]\d{8}$/.test(digits);
}
