/**
 * UI store — navigation + auth session.
 * Auth is demo-mode ready for Supabase Auth: swapping `login`/`logout` for
 * supabase.auth calls requires no other change.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Account } from "@/lib/types";

export type ViewKey =
  | "dashboard"
  | "calls"
  | "queue"
  | "contacts"
  | "campaigns"
  | "leads"
  | "agent"
  | "knowledge"
  | "followups"
  | "analytics"
  | "recordings"
  | "settings"
  | "account"
  | "login"
  | "forgot"
  /* Voxora ops modules */
  | "sales"
  | "pipeline"
  | "unclaimed"
  | "merge-review"
  | "bot-queue"
  | "whatsapp"
  | "performance"
  | "audit";

interface UiState {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  authed: boolean;
  account: Account;
  login: (acc?: Partial<Account>) => void;
  logout: () => void;
  updateAccount: (patch: Partial<Account>) => void;
  /** Header search handoff into list views. */
  callsSearch: string;
  contactsSearch: string;
  setCallsSearch: (q: string) => void;
  setContactsSearch: (q: string) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      view: "sales",
      setView: (view) => set({ view }),
      authed: false,
      account: { name: "أحمد المصري", email: "admin@voxora.ai", role: "admin" },
      login: (acc) => set((s) => ({ authed: true, account: { ...s.account, ...acc } })),
      logout: () => set({ authed: false, view: "login" }),
      updateAccount: (patch) => set((s) => {
        const { role: _ignoredRole, ...safePatch } = patch;
        return { account: { ...s.account, ...safePatch, role: s.account.role } };
      }),
      callsSearch: "",
      contactsSearch: "",
      setCallsSearch: (callsSearch) => set({ callsSearch }),
      setContactsSearch: (contactsSearch) => set({ contactsSearch }),
    }),
    {
      name: "voxora-ui-v2",
      partialize: (s) =>
        Object.fromEntries(Object.entries(s).filter(([k]) => !["callsSearch", "contactsSearch"].includes(k))),
    }
  )
);
