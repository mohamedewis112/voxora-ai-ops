/**
 * Central visual metadata for every domain status.
 * Components (StatusBadge) consume these maps so colors stay consistent app-wide.
 */

export type Tone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "violet"
  | "sky";

export interface StatusMeta {
  /** i18n dictionary key */
  key: string;
  tone: Tone;
}

export const callStatusMeta: Record<string, StatusMeta> = {
  answered: { key: "status.answered", tone: "success" },
  no_answer: { key: "status.no_answer", tone: "neutral" },
  busy: { key: "status.busy", tone: "warning" },
  wrong_number: { key: "status.wrong_number", tone: "danger" },
  failed: { key: "status.failed", tone: "danger" },
};

export const outcomeMeta: Record<string, StatusMeta> = {
  interested: { key: "outcome.interested", tone: "success" },
  not_interested: { key: "outcome.not_interested", tone: "danger" },
  callback: { key: "outcome.callback", tone: "warning" },
  transferred: { key: "outcome.transferred", tone: "violet" },
  sale: { key: "outcome.sale", tone: "success" },
  info: { key: "outcome.info", tone: "info" },
  none: { key: "outcome.none", tone: "neutral" },
};

export const agentStatusMeta: Record<string, StatusMeta> = {
  offline: { key: "agentStatus.offline", tone: "neutral" },
  ready: { key: "agentStatus.ready", tone: "info" },
  paused: { key: "agentStatus.paused", tone: "warning" },
  calling: { key: "agentStatus.calling", tone: "warning" },
  connected: { key: "agentStatus.connected", tone: "success" },
  speaking: { key: "agentStatus.speaking", tone: "success" },
  listening: { key: "agentStatus.listening", tone: "sky" },
  processing: { key: "agentStatus.processing", tone: "violet" },
  transferred: { key: "agentStatus.transferred", tone: "violet" },
  completed: { key: "agentStatus.completed", tone: "success" },
  failed: { key: "agentStatus.failed", tone: "danger" },
};

export const campaignStatusMeta: Record<string, StatusMeta> = {
  draft: { key: "campaignStatus.draft", tone: "neutral" },
  scheduled: { key: "campaignStatus.scheduled", tone: "info" },
  running: { key: "campaignStatus.running", tone: "success" },
  paused: { key: "campaignStatus.paused", tone: "warning" },
  completed: { key: "campaignStatus.completed", tone: "violet" },
};

export const leadStageMeta: Record<string, StatusMeta> = {
  new: { key: "stage.new", tone: "info" },
  contacted: { key: "stage.contacted", tone: "neutral" },
  interested: { key: "stage.interested", tone: "success" },
  followup: { key: "stage.followup", tone: "warning" },
  ready_to_close: { key: "stage.ready_to_close", tone: "violet" },
  transferred: { key: "stage.transferred", tone: "sky" },
  won: { key: "stage.won", tone: "success" },
  lost: { key: "stage.lost", tone: "danger" },
};

export const queueStatusMeta: Record<string, StatusMeta> = {
  waiting: { key: "queueStatus.waiting", tone: "info" },
  calling: { key: "queueStatus.calling", tone: "warning" },
  paused: { key: "queueStatus.paused", tone: "warning" },
  done: { key: "queueStatus.done", tone: "success" },
  canceled: { key: "queueStatus.canceled", tone: "neutral" },
};

export const followUpStatusMeta: Record<string, StatusMeta> = {
  pending: { key: "followUpStatus.pending", tone: "warning" },
  done: { key: "followUpStatus.done", tone: "success" },
  postponed: { key: "followUpStatus.postponed", tone: "info" },
  canceled: { key: "followUpStatus.canceled", tone: "neutral" },
};

export const contactStatusMeta: Record<string, StatusMeta> = {
  active: { key: "contactStatus.active", tone: "success" },
  dnd: { key: "contactStatus.dnd", tone: "danger" },
  archived: { key: "contactStatus.archived", tone: "neutral" },
  wrong_number: { key: "contactStatus.wrong_number", tone: "danger" },
};

export const priorityMeta: Record<string, StatusMeta> = {
  high: { key: "priority.high", tone: "danger" },
  normal: { key: "priority.normal", tone: "info" },
  low: { key: "priority.low", tone: "neutral" },
};

export const sentimentMeta: Record<string, StatusMeta> = {
  positive: { key: "sentiment.positive", tone: "success" },
  neutral: { key: "sentiment.neutral", tone: "neutral" },
  negative: { key: "sentiment.negative", tone: "danger" },
};

export const directionMeta: Record<string, StatusMeta> = {
  outbound: { key: "direction.outbound", tone: "info" },
  inbound: { key: "direction.inbound", tone: "violet" },
};

export const recordingStatusMeta: Record<string, StatusMeta> = {
  available: { key: "recording.available", tone: "success" },
  pending: { key: "recording.pending", tone: "warning" },
  unavailable: { key: "recording.unavailable", tone: "neutral" },
};

export const roleMeta: Record<string, StatusMeta> = {
  admin: { key: "role.admin", tone: "violet" },
  manager: { key: "role.manager", tone: "info" },
  sales_agent: { key: "role.sales_agent", tone: "success" },
  viewer: { key: "role.viewer", tone: "neutral" },
};
