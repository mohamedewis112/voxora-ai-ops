/**
 * Central data store (client-side).
 * Holds all entities + settings with localStorage persistence so CRUD feels real.
 * When Supabase is connected, each action below becomes an API call — the
 * signatures are designed to map 1:1 to `supabase/schema.sql` tables.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_AGENT,
  DEFAULT_SETTINGS,
  DEMO_CAMPAIGNS,
  makeDemoCalls,
  makeDemoContacts,
  makeDemoFollowUps,
  makeDemoKB,
  makeDemoLeads,
  makeDemoQueue,
} from "@/lib/demo-data";
import type {
  AgentConfig,
  AppSettings,
  Call,
  Campaign,
  Contact,
  FollowUp,
  KBItem,
  Lead,
  QueueItem,
} from "@/lib/types";
import { uid } from "@/lib/types";

interface DataState {
  contacts: Contact[];
  campaigns: Campaign[];
  calls: Call[];
  leads: Lead[];
  followups: FollowUp[];
  kb: KBItem[];
  queue: QueueItem[];
  agent: AgentConfig;
  settings: AppSettings;

  addContact: (c: Partial<Contact>) => Contact;
  addContacts: (list: Contact[]) => void;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  bulkUpdateContacts: (ids: string[], patch: Partial<Contact>) => void;
  deleteContacts: (ids: string[]) => void;

  addCampaign: (c: Partial<Campaign>) => Campaign;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;

  upsertCall: (call: Call) => void;
  updateCall: (id: string, patch: Partial<Call>) => void;

  addLead: (l: Partial<Lead>) => Lead;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  deleteLead: (id: string) => void;

  addFollowUp: (f: Partial<FollowUp>) => FollowUp;
  updateFollowUp: (id: string, patch: Partial<FollowUp>) => void;
  deleteFollowUp: (id: string) => void;

  addKB: (k: Partial<KBItem>) => KBItem;
  updateKB: (id: string, patch: Partial<KBItem>) => void;
  deleteKB: (id: string) => void;

  addQueueItem: (q: Partial<QueueItem>) => QueueItem;
  updateQueueItem: (id: string, patch: Partial<QueueItem>) => void;
  removeQueueItems: (ids: string[]) => void;
  moveQueueItem: (id: string, offset: number) => void;
  sendQueueItemTop: (id: string) => void;
  clearFinishedQueue: () => void;
  setQueuePaused: (paused: boolean) => void;

  updateAgent: (patch: Partial<AgentConfig>) => void;
  updateSettings: <K extends keyof AppSettings>(section: K, patch: Partial<AppSettings[K]>) => void;
  resetDemoData: () => void;
}

export const useDataStore = create<DataState>()(
  persist(
    (set) => ({
      contacts: [],
      campaigns: [],
      calls: [],
      leads: [],
      followups: [],
      kb: [],
      queue: [],
      agent: DEFAULT_AGENT,
      settings: DEFAULT_SETTINGS,

      addContact: (c) => {
        const contact: Contact = {
          id: uid("cnt"),
          name: c.name ?? "بدون اسم",
          phone: c.phone ?? "",
          business: c.business ?? "",
          category: c.category ?? "",
          city: c.city ?? "",
          area: c.area ?? "",
          source: c.source ?? "تكليف يدوي",
          status: c.status ?? "active",
          tags: c.tags ?? [],
          campaignId: c.campaignId ?? null,
          lastCallAt: null,
          nextFollowUpAt: c.nextFollowUpAt ?? null,
          notes: c.notes ?? "",
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ contacts: [contact, ...s.contacts] }));
        return contact;
      },
      addContacts: (list) => set((s) => ({ contacts: [...list, ...s.contacts] })),
      updateContact: (id, patch) =>
        set((s) => ({ contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      bulkUpdateContacts: (ids, patch) =>
        set((s) => ({ contacts: s.contacts.map((c) => (ids.includes(c.id) ? { ...c, ...patch } : c)) })),
      deleteContacts: (ids) =>
        set((s) => ({
          contacts: s.contacts.filter((c) => !ids.includes(c.id)),
          queue: s.queue.filter((q) => !ids.includes(q.contactId)),
        })),

      addCampaign: (c) => {
        const campaign: Campaign = {
          id: uid("cmp"),
          name: c.name ?? "حملة جديدة",
          purpose: c.purpose ?? "",
          callType: c.callType ?? "outbound_sales",
          startDate: c.startDate ?? new Date().toISOString(),
          timeFrom: c.timeFrom ?? "10:00",
          timeTo: c.timeTo ?? "18:00",
          maxCallsPerDay: c.maxCallsPerDay ?? 100,
          retryAttempts: c.retryAttempts ?? 3,
          retryDelayHours: c.retryDelayHours ?? 4,
          agentId: c.agentId ?? "agent_1",
          knowledgeIds: c.knowledgeIds ?? [],
          status: c.status ?? "draft",
          createdAt: new Date().toISOString(),
        };
        set((s) => ({ campaigns: [campaign, ...s.campaigns] }));
        return campaign;
      },
      updateCampaign: (id, patch) =>
        set((s) => ({ campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      deleteCampaign: (id) =>
        set((s) => ({
          campaigns: s.campaigns.filter((c) => c.id !== id),
          contacts: s.contacts.map((c) => (c.campaignId === id ? { ...c, campaignId: null } : c)),
        })),

      upsertCall: (call) =>
        set((s) => ({
          calls: s.calls.some((c) => c.id === call.id)
            ? s.calls.map((c) => (c.id === call.id ? call : c))
            : [call, ...s.calls],
        })),
      updateCall: (id, patch) =>
        set((s) => ({ calls: s.calls.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

      addLead: (l) => {
        const lead: Lead = {
          id: uid("lead"),
          contactId: l.contactId ?? "",
          name: l.name ?? "",
          phone: l.phone ?? "",
          business: l.business ?? "",
          stage: l.stage ?? "new",
          score: l.score ?? 0,
          lastCallAt: l.lastCallAt ?? null,
          nextAction: l.nextAction ?? "",
          campaignId: l.campaignId ?? null,
        };
        set((s) => ({ leads: [lead, ...s.leads] }));
        return lead;
      },
      updateLead: (id, patch) =>
        set((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
      deleteLead: (id) => set((s) => ({ leads: s.leads.filter((l) => l.id !== id) })),

      addFollowUp: (f) => {
        const fu: FollowUp = {
          id: uid("fu"),
          contactId: f.contactId ?? "",
          name: f.name ?? "",
          phone: f.phone ?? "",
          reason: f.reason ?? "",
          dueAt: f.dueAt ?? new Date().toISOString(),
          campaignId: f.campaignId ?? null,
          status: f.status ?? "pending",
          callId: f.callId ?? null,
        };
        set((s) => ({ followups: [fu, ...s.followups] }));
        return fu;
      },
      updateFollowUp: (id, patch) =>
        set((s) => ({ followups: s.followups.map((f) => (f.id === id ? { ...f, ...patch } : f)) })),
      deleteFollowUp: (id) => set((s) => ({ followups: s.followups.filter((f) => f.id !== id) })),

      addKB: (k) => {
        const item: KBItem = {
          id: uid("kb"),
          title: k.title ?? "مقال جديد",
          category: k.category ?? "عن الشركة",
          type: k.type ?? "text",
          content: k.content ?? "",
          faq: k.faq ?? [],
          fileName: k.fileName ?? null,
          tags: k.tags ?? [],
          updatedAt: new Date().toISOString(),
          active: k.active ?? true,
        };
        set((s) => ({ kb: [item, ...s.kb] }));
        return item;
      },
      updateKB: (id, patch) =>
        set((s) => ({
          kb: s.kb.map((k) => (k.id === id ? { ...k, ...patch, updatedAt: new Date().toISOString() } : k)),
        })),
      deleteKB: (id) => set((s) => ({ kb: s.kb.filter((k) => k.id !== id) })),

      addQueueItem: (q) => {
        const item: QueueItem = {
          id: uid("q"),
          contactId: q.contactId ?? "",
          name: q.name ?? "",
          phone: q.phone ?? "",
          campaignId: q.campaignId ?? "",
          attempts: q.attempts ?? 0,
          priority: q.priority ?? "normal",
          scheduledAt: q.scheduledAt ?? new Date().toISOString(),
          status: q.status ?? "waiting",
        };
        set((s) => ({ queue: [...s.queue, item] }));
        return item;
      },
      updateQueueItem: (id, patch) =>
        set((s) => ({ queue: s.queue.map((q) => (q.id === id ? { ...q, ...patch } : q)) })),
      removeQueueItems: (ids) => set((s) => ({ queue: s.queue.filter((q) => !ids.includes(q.id)) })),
      moveQueueItem: (id, offset) =>
        set((s) => {
          const idx = s.queue.findIndex((q) => q.id === id);
          const next = idx + offset;
          if (idx < 0 || next < 0 || next >= s.queue.length) return s;
          const arr = [...s.queue];
          const [it] = arr.splice(idx, 1);
          arr.splice(next, 0, it);
          return { queue: arr };
        }),
      sendQueueItemTop: (id) =>
        set((s) => {
          const idx = s.queue.findIndex((q) => q.id === id);
          if (idx < 0) return s;
          const arr = [...s.queue];
          const [it] = arr.splice(idx, 1);
          return { queue: [it, ...arr] };
        }),
      clearFinishedQueue: () =>
        set((s) => ({ queue: s.queue.filter((q) => q.status !== "done" && q.status !== "canceled") })),
      setQueuePaused: (paused) =>
        set((s) => ({
          queue: s.queue.map((q) =>
            q.status === "waiting" ? { ...q, status: paused ? ("paused" as const) : ("waiting" as const) } : q
          ),
        })),

      updateAgent: (patch) => set((s) => ({ agent: { ...s.agent, ...patch } })),
      updateSettings: (section, patch) =>
        set((s) => ({ settings: { ...s.settings, [section]: { ...s.settings[section], ...patch } } })),
      resetDemoData: () => {
        const contacts = makeDemoContacts();
        set({
          contacts,
          campaigns: DEMO_CAMPAIGNS,
          calls: makeDemoCalls(contacts),
          leads: makeDemoLeads(contacts),
          followups: makeDemoFollowUps(contacts),
          kb: makeDemoKB(),
          queue: makeDemoQueue(contacts),
          agent: DEFAULT_AGENT,
          settings: DEFAULT_SETTINGS,
        });
      },
    }),
    { name: "voxora-data-v2" }
  )
);

/**
 * Hydrate demo content on first load only (when no persisted state exists).
 */
export function ensureDemoData() {
  const s = useDataStore.getState();
  if (s.contacts.length > 0) return;
  const contacts = makeDemoContacts();
  useDataStore.setState({
    contacts,
    campaigns: DEMO_CAMPAIGNS,
    calls: makeDemoCalls(contacts),
    leads: makeDemoLeads(contacts),
    followups: makeDemoFollowUps(contacts),
    kb: makeDemoKB(),
    queue: makeDemoQueue(contacts),
  });
}
