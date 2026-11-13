/**
 * Voxora AI — shared ops types (client + server).
 * Mirrors prisma ops models 1:1; JSON columns are typed as parsed shapes.
 * The real deployment uses the same shapes against `supabase/ops-schema.sql`.
 */

export type LeadStatus =
  | "new" | "assigned" | "queued" | "calling" | "ringing" | "answered"
  | "busy" | "no_answer" | "switched_off" | "invalid_number" | "out_of_service"
  | "callback" | "interested" | "not_interested" | "whatsapp_followup"
  | "transferred_to_sales" | "linked" | "closed_business" | "completed" | "failed";

export type ListingStatus =
  | "active" | "merged" | "hidden" | "suspended" | "closed_business"
  | "invalid_phone" | "out_of_service" | "wrong_business_phone";

export type ActorType = "admin" | "sales_agent" | "ai_agent" | "system" | "customer";

export interface AgentDTO {
  id: string;
  name: string;
  role: string;
  rawPhone: string | null;
  status: string;
  canReceiveLeads: boolean;
  createdAt: string;
}

export interface LeadDTO {
  id: string;
  rawPhone: string;
  normalizedPhone: string;
  prefix: string | null;
  listingId: string | null;
  userId: string | null;
  businessName: string;
  customerName: string;
  status: string;
  priority: string;
  assignedAgentId: string | null;
  originalAgentId: string | null;
  botStatus: string;
  source: string;
  campaign: string | null;
  lastOutcome: string | null;
  createdAt: string;
  updatedAt: string;
  /** expanded server-side */
  agentName?: string | null;
  listingName?: string | null;
  userRegistered?: boolean;
}

export interface ListingDTO {
  id: string;
  businessName: string;
  rawPhone: string;
  normalizedPhone: string;
  whatsapp: string | null;
  category: string | null;
  governorate: string | null;
  city: string | null;
  village: string | null;
  address: string | null;
  description: string | null;
  logo: string | null;
  images: string[];
  socialLinks: Record<string, string>;
  website: string | null;
  email: string | null;
  openingHours: string | null;
  products: string | null;
  ownerUserId: string | null;
  ownerPhoneNormalized: string | null;
  status: string;
  canonicalListingId: string | null;
  createdAt: string;
  updatedAt: string;
  ownerName?: string | null;
  ownerRegistered?: boolean;
}

export interface CallAttemptDTO {
  id: string;
  leadId: string;
  agentType: string;
  agentId: string | null;
  outcome: string;
  reason: string | null;
  confidence: number | null;
  notes: string | null;
  durationSec: number;
  createdAt: string;
}

export interface TimelineEventDTO {
  id: string;
  leadId: string;
  type: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  title: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface BotQueueDTO {
  id: string;
  leadId: string;
  status: string;
  priority: number;
  attempts: number;
  scheduledAt: string | null;
  lastResult: string | null;
  addedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  lead?: LeadDTO | null;
}

export interface WhatsAppMessageDTO {
  id: string;
  threadId: string;
  direction: "out" | "in";
  body: string;
  template: string | null;
  status: string;
  actorType: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface WhatsAppThreadDTO {
  id: string;
  leadId: string | null;
  phoneNormalized: string;
  displayName: string;
  listingId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  lastMessagePreview?: string;
  lastMessageStatus?: string;
  lead?: LeadDTO | null;
}

export interface AuditLogDTO {
  id: string;
  actorType: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  reason: string | null;
  source: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface MergeReasonDTO {
  code: string;
  label: string;
  score: number;
}

export interface MergeJobDTO {
  id: string;
  canonicalListingId: string;
  duplicateListingId: string;
  confidence: number;
  reasons: MergeReasonDTO[];
  status: string;
  fieldChanges: MergeFieldChangeDTO[];
  createdAt: string;
  reviewedAt: string | null;
  canonical?: ListingDTO | null;
  duplicate?: ListingDTO | null;
}

export interface MergeFieldChangeDTO {
  field: string;
  action: "kept_existing" | "filled_from_new" | "appended";
  kept: unknown;
  from: unknown;
}

export interface OwnerCandidateDTO {
  userId: string | null;
  fullName: string;
  normalizedPhone: string;
  isRegistered: boolean;
  matchScore: number;
  matchReason: string;
}

export interface PhoneLookupDTO {
  normalizedPhone: string;
  prefix: string | null;
  registered: boolean;
  registeredUserName: string | null;
  ownedListings: ListingDTO[];
  potentialUnclaimed: { listing: ListingDTO; matchScore: number; matchReason: string }[];
  existingLead: LeadDTO | null;
  recentCalls: number;
  whatsappThreads: number;
}

export interface DistributionRowDTO {
  agentId: string;
  agentName: string;
  status: string;
  counts: Record<string, number>; // prefix → count
  total: number;
}

export interface PerformanceRowDTO {
  label: string;
  kind: "sales" | "ai";
  calls: number;
  answered: number;
  interested: number;
  followups: number;
  linked: number;
  conversionRate: number;
}

export interface OpsOverviewDTO {
  totalLeads: number;
  leadsByPrefix: Record<string, number>;
  distribution: DistributionRowDTO[];
  unclaimedCount: number;
  pendingMerges: number;
  botQueued: number;
  botRunning: number;
  whatsappUnread: number;
  callStatusCounts: Record<string, number>;
  invalidCount: number;
  closedCount: number;
  hiddenCount: number;
  notificationsUnread: number;
}

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  error: string;
}
export type ApiResponse<T> = ApiOk<T> | ApiErr;
