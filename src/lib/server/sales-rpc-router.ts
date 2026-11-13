import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import type { VoxoraActor } from "@/lib/server/voxora-auth";

type Json = Record<string, unknown>;

function ok(data: unknown, status = 200) {
  return Response.json({ ok: true, data }, { status });
}
function err(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

async function rpc<T>(name: string, body: Json): Promise<T> {
  const c = serverRuntimeConfig();
  if (!c.daleelySupabaseUrl || !c.supabasePublishableKey || !c.voxoraAppKey) {
    throw new Error("sales_backend_not_configured");
  }
  const r = await fetch(
    `${c.daleelySupabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${name}`,
    {
      method: "POST",
      headers: {
        apikey: c.supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_app_key: c.voxoraAppKey, ...body }),
      cache: "no-store",
    }
  );
  const data = await r.json().catch(async () => ({ message: await r.text().catch(() => "") }));
  if (!r.ok) {
    const message = typeof data?.message === "string" ? data.message : "sales_rpc_error";
    throw new Error(message);
  }
  return data as T;
}

function param(url: URL, key: string, fallback = "") {
  return url.searchParams.get(key) || fallback;
}

export async function handleSalesRpcGet(path: string[], req: Request, actor: VoxoraActor): Promise<Response> {
  if (actor.type !== "sales_agent") return err("forbidden", 403);
  const url = new URL(req.url);

  if (path[0] === "agents") {
    return ok(await rpc("voxora_sales_query", {
      p_agent_id: actor.id,
      p_resource: "agents",
      p_id: null,
      p_status: "all",
      p_prefix: "all",
      p_q: "",
    }));
  }

  if (path[0] === "leads" && !path[1]) {
    return ok(await rpc("voxora_sales_query", {
      p_agent_id: actor.id,
      p_resource: "leads",
      p_id: null,
      p_status: param(url, "status", "all"),
      p_prefix: param(url, "prefix", "all"),
      p_q: param(url, "q", ""),
    }));
  }

  if (path[0] === "leads" && path[1] && path[2] === "detail") {
    return ok(await rpc("voxora_sales_query", {
      p_agent_id: actor.id,
      p_resource: "detail",
      p_id: path[1],
      p_status: "all",
      p_prefix: "all",
      p_q: "",
    }));
  }

  if (path[0] === "leads" && path[1] && path[2] === "link-candidates") {
    return ok(await rpc("voxora_sales_query", {
      p_agent_id: actor.id,
      p_resource: "link_candidates",
      p_id: path[1],
      p_status: "all",
      p_prefix: "all",
      p_q: "",
    }));
  }

  if (path[0] === "notifications") return ok([]);
  if (path[0] === "overview") {
    const leads = await rpc<Array<{ prefix?: string; status?: string }>>("voxora_sales_query", {
      p_agent_id: actor.id,
      p_resource: "leads",
      p_id: null,
      p_status: "all",
      p_prefix: "all",
      p_q: "",
    });
    const leadsByPrefix: Record<string, number> = {};
    const callStatusCounts: Record<string, number> = {};
    for (const lead of leads) {
      const prefix = lead.prefix || "other";
      const status = lead.status || "new";
      leadsByPrefix[prefix] = (leadsByPrefix[prefix] || 0) + 1;
      callStatusCounts[status] = (callStatusCounts[status] || 0) + 1;
    }
    return ok({
      totalLeads: leads.length,
      leadsByPrefix,
      distribution: [{ agentId: actor.id, agentName: actor.name, status: "active", counts: leadsByPrefix, total: leads.length }],
      unclaimedCount: 0, pendingMerges: 0, botQueued: 0, botRunning: 0,
      whatsappUnread: 0, callStatusCounts, invalidCount: callStatusCounts.invalid_number || 0,
      closedCount: callStatusCounts.closed_business || 0, hiddenCount: 0, notificationsUnread: 0,
    });
  }

  return err("forbidden", 403);
}

export async function handleSalesRpcPost(path: string[], req: Request, actor: VoxoraActor): Promise<Response> {
  if (actor.type !== "sales_agent") return err("forbidden", 403);
  const body = await req.json().catch(() => ({})) as Json;

  if (path[0] === "leads" && path[1] && path[2]) {
    const allowed = new Set([
      "outcome",
      "notes",
      "callback",
      "whatsapp-followup",
      "link-owner",
      "confirm-business-status",
    ]);
    if (!allowed.has(path[2])) return err("forbidden", 403);
    return ok(await rpc("voxora_sales_action", {
      p_agent_id: actor.id,
      p_lead_id: path[1],
      p_action: path[2],
      p_payload: body,
    }));
  }

  if (path[0] === "notifications" && path[1] === "read") return ok({ ok: true });
  return err("forbidden", 403);
}
