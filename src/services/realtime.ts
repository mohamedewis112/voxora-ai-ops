/**
 * Realtime event bus.
 *
 * Today the MockTelephonyProvider emits lifecycle events here. When the real
 * backend lands, a WebSocket/Supabase-Realtime adapter publishes the SAME
 * event names — UI components never change (see docs/INTEGRATION.md).
 *
 * Events: call.started | call.ringing | call.answered | agent.listening |
 * agent.thinking | agent.speaking | call.transferred | call.completed | call.failed
 */

import type { RealtimeEvent, RealtimeEventName } from "@/lib/types";

type Handler = (event: RealtimeEvent) => void;

const handlers = new Set<Handler>();

export const realtime = {
  subscribe(handler: Handler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  },
  emit(name: RealtimeEventName, payload?: Record<string, unknown>, callId?: string) {
    const event: RealtimeEvent = { name, payload, callId, at: new Date().toISOString() };
    handlers.forEach((h) => h(event));
  },
};
