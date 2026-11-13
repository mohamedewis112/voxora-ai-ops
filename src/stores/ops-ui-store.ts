"use client";

/**
 * Voxora AI — ops UI store: cross-view lead selection.
 * Any ops view can `selectLead(id)` then `setView("sales")` to open its detail sheet.
 */
import { create } from "zustand";

interface OpsUiState {
  selectedLeadId: string | null;
  selectLead: (leadId: string) => void;
  clearLead: () => void;
}

export const useOpsUiStore = create<OpsUiState>()((set) => ({
  selectedLeadId: null,
  selectLead: (leadId) => set({ selectedLeadId: leadId }),
  clearLead: () => set({ selectedLeadId: null }),
}));
