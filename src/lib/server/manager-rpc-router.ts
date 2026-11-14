import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import type { VoxoraActor } from "@/lib/server/voxora-auth";

type Json = Record<string, unknown>;

function ok(data: unknown, status = 200) {
  return Response.json({ ok: true, data }, { status });
}
function err(error: string, status = 400) {
  return Response.json({ ok: false, error }, { status });
}

async function rpc<T>(body: Json): Promise<T> {
  const c = serverRuntimeConfig();
  if (!c.daleelySupabaseUrl || !c.supabasePublishableKey || !c.voxoraAppKey) {
    throw new Error("manager_backend_not_configured");
  }
  const r = await fetch(
    `${c.daleelySupabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/voxora_manager_query`,
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

export async function handleManagerRpcPost(_path: string[], _req: Request, actor: VoxoraActor): Promise<Response> {
  if (actor.type !== "admin") return err("forbidden", 403);
  return err("manager_read_only", 403);
}
