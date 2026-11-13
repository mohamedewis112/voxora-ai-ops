import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import { requireVoxoraActor } from "@/lib/server/voxora-auth";

export const dynamic = "force-dynamic";

type Action =
  | "start_agent" | "pause_agent" | "stop_agent" | "status"
  | "start_call" | "end_call" | "transfer_call" | "transcript" | "recording";

function endpoint(action: Action, callId?: string) {
  const id = callId ? encodeURIComponent(callId) : "";
  switch (action) {
    case "start_agent": return { method: "POST", path: "/agent/start" };
    case "pause_agent": return { method: "POST", path: "/agent/pause" };
    case "stop_agent": return { method: "POST", path: "/agent/stop" };
    case "status": return { method: "GET", path: "/agent/status" };
    case "start_call": return { method: "POST", path: "/calls" };
    case "end_call": return { method: "POST", path: `/calls/${id}/hangup` };
    case "transfer_call": return { method: "POST", path: `/calls/${id}/transfer` };
    case "transcript": return { method: "GET", path: `/calls/${id}/transcript` };
    case "recording": return { method: "GET", path: `/calls/${id}/recording` };
  }
}

export async function POST(req: Request) {
  const auth = await requireVoxoraActor(req); if (auth.response) return auth.response;
  const cfg = serverRuntimeConfig();
  if (!cfg.telephonyBackendUrl) return Response.json({ ok: false, error: "telephony_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({})) as { action?: Action; callId?: string; target?: unknown; destination?: string };
  if (!body.action) return Response.json({ ok: false, error: "action_required" }, { status: 400 });
  const ep = endpoint(body.action, body.callId);
  const url = `${cfg.telephonyBackendUrl.replace(/\/$/, "")}${ep.path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.TELEPHONY_API_SECRET) headers.Authorization = `Bearer ${process.env.TELEPHONY_API_SECRET}`;
  const payload = body.action === "start_call" ? body.target : body.action === "transfer_call" ? { destination: body.destination } : undefined;
  try {
    const r = await fetch(url, {
      method: ep.method,
      headers,
      body: ep.method === "GET" ? undefined : JSON.stringify(payload ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(body.action === "start_call" ? 15000 : 8000),
    });
    const out = await r.json().catch(() => ({}));
    return Response.json({ ok: r.ok, data: out }, { status: r.ok ? 200 : r.status });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "telephony_unreachable" }, { status: 503 });
  }
}
