import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import { daleelyRest } from "@/integrations/daleely/supabase-server";

const ACCESS_COOKIE = "voxora_access_token";
const REFRESH_COOKIE = "voxora_refresh_token";

export interface VoxoraActor {
  userId: string;
  type: "admin" | "sales_agent";
  id: string;
  name: string;
  role: string;
}

function cookieValue(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  for (const item of raw.split(";")) {
    const [k, ...rest] = item.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function accessCookieName() { return ACCESS_COOKIE; }
export function refreshCookieName() { return REFRESH_COOKIE; }

export async function fetchSupabaseUser(accessToken: string) {
  const c = serverRuntimeConfig();
  if (!c.daleelySupabaseUrl || !c.supabasePublishableKey || !accessToken) return null;
  const r = await fetch(`${c.daleelySupabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: c.supabasePublishableKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return await r.json() as { id: string; email?: string };
}

async function getRows<T>(path: string): Promise<T[]> {
  const r = await daleelyRest(path, { method: "GET", headers: { Prefer: "count=none" } });
  if (!r.ok) return [];
  return await r.json() as T[];
}

export async function authorizeVoxoraRequest(req: Request): Promise<VoxoraActor | null> {
  const token = cookieValue(req, ACCESS_COOKIE);
  const user = await fetchSupabaseUser(token);
  if (!user?.id) return null;

  const admins = await getRows<{ id: string; user_id: string | null; name: string | null; role: string; is_active: boolean }>(
    `admins?select=id,user_id,name,role,is_active&user_id=eq.${encodeURIComponent(user.id)}&is_active=eq.true&limit=1`
  );
  if (admins[0]) {
    return { userId: user.id, type: "admin", id: admins[0].id, name: admins[0].name || user.email || "Admin", role: admins[0].role };
  }

  const agents = await getRows<{ id: string; daleely_user_id: string | null; name: string; role: string; status: string }>(
    `voxora_sales_agents?select=id,daleely_user_id,name,role,status&daleely_user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=1`
  );
  if (agents[0]) {
    return { userId: user.id, type: "sales_agent", id: agents[0].id, name: agents[0].name, role: agents[0].role };
  }
  return null;
}

export async function requireVoxoraActor(req: Request) {
  const actor = await authorizeVoxoraRequest(req);
  if (!actor) return { actor: null, response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  return { actor, response: null };
}
