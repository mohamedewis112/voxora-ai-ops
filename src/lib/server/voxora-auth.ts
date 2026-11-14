import { createHmac, timingSafeEqual } from "node:crypto";
import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import { daleelyRest } from "@/integrations/daleely/supabase-server";

const ACCESS_COOKIE = "voxora_access_token";
const REFRESH_COOKIE = "voxora_refresh_token";
const SALES_COOKIE = "voxora_sales_session";

export interface VoxoraActor {
  userId: string;
  type: "admin" | "sales_agent";
  id: string;
  name: string;
  role: string;
  email?: string;
}

interface SalesSessionPayload {
  id: string;
  name: string;
  email: string;
  role: "sales_agent";
  exp: number;
}

function cookieValue(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  for (const item of raw.split(";")) {
    const [k, ...rest] = item.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function b64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromB64url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSalesSessionValue(
  actor: { id: string; name: string; email: string },
  maxAgeSeconds = 60 * 60 * 12
) {
  const c = serverRuntimeConfig();
  if (!c.voxoraSessionSecret) throw new Error("sales_session_not_configured");
  const payload: SalesSessionPayload = {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    role: "sales_agent",
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, c.voxoraSessionSecret)}`;
}

function parseSalesSession(value: string): SalesSessionPayload | null {
  const c = serverRuntimeConfig();
  if (!value || !c.voxoraSessionSecret) return null;
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded, c.voxoraSessionSecret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(fromB64url(encoded)) as SalesSessionPayload;
    if (!payload.id || !payload.name || !payload.email || payload.role !== "sales_agent") return null;
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function accessCookieName() { return ACCESS_COOKIE; }
export function refreshCookieName() { return REFRESH_COOKIE; }
export function salesCookieName() { return SALES_COOKIE; }

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
  const sales = parseSalesSession(cookieValue(req, SALES_COOKIE));
  if (sales) {
    return {
      userId: sales.id,
      type: "sales_agent",
      id: sales.id,
      name: sales.name,
      role: "sales_agent",
      email: sales.email,
    };
  }

  const c = serverRuntimeConfig();
  if (!c.supabaseSecretKey) return null;

  const token = cookieValue(req, ACCESS_COOKIE);
  const user = await fetchSupabaseUser(token);
  if (!user?.id) return null;

  const admins = await getRows<{ id: string; user_id: string | null; name: string | null; role: string; is_active: boolean }>(
    `admins?select=id,user_id,name,role,is_active&user_id=eq.${encodeURIComponent(user.id)}&is_active=eq.true&limit=1`
  );
  if (admins[0]) {
    return { userId: user.id, type: "admin", id: admins[0].id, name: admins[0].name || user.email || "Admin", role: admins[0].role, email: user.email };
  }

  const agents = await getRows<{ id: string; daleely_user_id: string | null; name: string; role: string; status: string }>(
    `voxora_sales_agents?select=id,daleely_user_id,name,role,status&daleely_user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&limit=1`
  );
  if (agents[0]) {
    return { userId: user.id, type: "sales_agent", id: agents[0].id, name: agents[0].name, role: "sales_agent", email: user.email };
  }
  return null;
}

export async function requireVoxoraActor(req: Request) {
  const actor = await authorizeVoxoraRequest(req);
  if (!actor) return { actor: null, response: Response.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  return { actor, response: null };
}
