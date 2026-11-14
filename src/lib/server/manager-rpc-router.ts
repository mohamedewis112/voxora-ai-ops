import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import type { VoxoraActor } from "@/lib/server/voxora-auth";

type Json = Record<string, unknown>;

function ok(data: unknown, status = 200) {
  return Response.json({ ok: true, data }, { status });
}
function err(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

async function rpcNamed<T>(name: string, body: Json): Promise<T> {
  const c = serverRuntimeConfig();
  if (!c.daleelySupabaseUrl || !c.supabasePublishableKey || !c.voxoraAppKey) {
    throw new Error("manager_backend_not_configured");
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
    const message = typeof data?.message === "string" ? data.message : "manager_rpc_error";
    throw new Error(message);
  }
  return data as T;
}

async function rpc<T>(body: Json): Promise<T> {
  return rpcNamed<T>("voxora_manager_query", body);
}

function param(url: URL, key: string, fallback = "") {
  return url.searchParams.get(key) || fallback;
}

export async function handleManagerRpcGet(path: string[], req: Request, actor: VoxoraActor): Promise<Response> {
  if (actor.type !== "admin") return err("forbidden", 403);
  const url = new URL(req.url);

  if (path[0] === "overview") {
    return ok(await rpc({
      p_resource: "overview",
      p_id: null,
      p_agent_id: null,
      p_status: "all",
      p_prefix: "all",
      p_q: "",
    }));
  }

  if (path[0] === "agents") {
    return ok(await rpc({
      p_resource: "agents",
      p_id: null,
      p_agent_id: null,
      p_status: "all",
      p_prefix: "all",
      p_q: "",
    }));
  }

  if (path[0] === "leads" && !path[1]) {
    const agentId = param(url, "agentId", "");
    return ok(await rpc({
      p_resource: "leads",
      p_id: null,
      p_agent_id: agentId || null,
      p_status: param(url, "status", "all"),
      p_prefix: param(url, "prefix", "all"),
      p_q: param(url, "q", ""),
    }));
  }

  if (path[0] === "leads" && path[1] && path[2] === "detail") {
    return ok(await rpc({
      p_resource: "detail",
      p_id: path[1],
      p_agent_id: null,
      p_status: "all",
      p_prefix: "all",
      p_q: "",
    }));
  }

  if (path[0] === "followups") {
    const agentId = param(url, "agentId", "");
    return ok(await rpc({
      p_resource: "followups",
      p_id: null,
      p_agent_id: agentId || null,
      p_status: param(url, "status", "all"),
      p_prefix: "all",
      p_q: "",
    }));
  }

  if (path[0] === "activity") {
    return ok(await rpc({
      p_resource: "activity",
      p_id: null,
      p_agent_id: null,
      p_status: "all",
      p_prefix: "all",
      p_q: "",
    }));
  }

  if (path[0] === "notifications") return ok([]);
  return err("forbidden", 403);
}

function transferErrorStatus(message: string) {
  if (message === "forbidden" || message === "unauthorized") return 403;
  if (message === "lead_not_found" || message === "target_agent_not_found") return 404;
  return 400;
}

export async function handleManagerRpcPost(path: string[], req: Request, actor: VoxoraActor): Promise<Response> {
  if (actor.type !== "admin") return err("forbidden", 403);

  if (!(path[0] === "leads" && path[1] === "transfer" && !path[2])) {
    return err("manager_read_only", 403);
  }

  const body = await req.json().catch(() => ({})) as Json;
  const rawLeadIds = Array.isArray(body.leadIds) ? body.leadIds : [];
  const leadIds = [...new Set(rawLeadIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))];
  const newAgentId = typeof body.newAgentId === "string" ? body.newAgentId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (leadIds.length === 0) return err("missing_leads", 400);
  if (!newAgentId) return err("missing_target_agent", 400);

  try {
    return ok(await rpcNamed("voxora_manager_transfer_leads", {
      p_manager_id: actor.id,
      p_manager_name: actor.name,
      p_lead_ids: leadIds,
      p_new_agent_id: newAgentId,
      p_reason: reason || null,
    }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "manager_transfer_error";
    return err(message, transferErrorStatus(message));
  }
}
