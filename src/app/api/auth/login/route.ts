import { pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import {
  accessCookieName,
  refreshCookieName,
  salesCookieName,
  createSalesSessionValue,
  fetchSupabaseUser,
} from "@/lib/server/voxora-auth";
import { daleelyRest } from "@/integrations/daleely/supabase-server";

export const dynamic = "force-dynamic";

interface SalesCredential {
  agentId: string;
  email: string;
  name: string;
  role: "sales_agent";
  passwordSalt: string;
  passwordHash: string;
  passwordIterations: number;
}

async function salesCredential(email: string): Promise<SalesCredential | null> {
  const c = serverRuntimeConfig();
  if (!c.daleelySupabaseUrl || !c.supabasePublishableKey || !c.voxoraAppKey) return null;
  const r = await fetch(`${c.daleelySupabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/voxora_sales_credential`, {
    method: "POST",
    headers: {
      apikey: c.supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_app_key: c.voxoraAppKey, p_email: email }),
    cache: "no-store",
  });
  if (!r.ok) return null;
  return await r.json() as SalesCredential | null;
}

function validPassword(password: string, credential: SalesCredential) {
  try {
    const derived = Buffer.from(
      pbkdf2Sync(
        password,
        Buffer.from(credential.passwordSalt, "hex"),
        credential.passwordIterations,
        32,
        "sha256"
      )
    );
    const expected = Buffer.from(credential.passwordHash, "hex");
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

async function allowed(userId: string) {
  const admin = await daleelyRest(`admins?select=id,name,role&user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&limit=1`, { method: "GET" });
  const admins = admin.ok ? await admin.json() as Array<{ id: string; name: string | null; role: string }> : [];
  if (admins[0]) return { allowed: true, name: admins[0].name || "Admin", role: admins[0].role };
  const agent = await daleelyRest(`voxora_sales_agents?select=id,name,role&daleely_user_id=eq.${encodeURIComponent(userId)}&status=eq.active&limit=1`, { method: "GET" });
  const agents = agent.ok ? await agent.json() as Array<{ id: string; name: string; role: string }> : [];
  if (agents[0]) return { allowed: true, name: agents[0].name, role: "sales_agent" };
  return { allowed: false, name: "", role: "" };
}

export async function POST(req: Request) {
  const c = serverRuntimeConfig();
  if (!c.daleelySupabaseUrl || !c.supabasePublishableKey) {
    return Response.json({ ok: false, error: "auth_not_configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({})) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase() || "";
  const password = body.password?.trim() || "";
  if (!email || !password) return Response.json({ ok: false, error: "missing_credentials" }, { status: 400 });

  const sales = await salesCredential(email);
  if (sales) {
    if (!c.voxoraSessionSecret || !validPassword(password, sales)) {
      return Response.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
    }
    const maxAge = 60 * 60 * 12;
    const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    const session = createSalesSessionValue({ id: sales.agentId, name: sales.name, email: sales.email }, maxAge);
    headers.append("Set-Cookie", `${salesCookieName()}=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`);
    return new Response(JSON.stringify({
      ok: true,
      data: { name: sales.name, email: sales.email, role: "sales_agent" },
    }), { status: 200, headers });
  }

  if (!c.supabaseSecretKey) {
    return Response.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  }

  const r = await fetch(`${c.daleelySupabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: c.supabasePublishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  const payload = await r.json().catch(() => ({})) as {
    access_token?: string; refresh_token?: string; expires_in?: number;
    user?: { id?: string; email?: string };
  };
  if (!r.ok || !payload.access_token) return Response.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  const user = payload.user?.id ? payload.user : await fetchSupabaseUser(payload.access_token);
  if (!user?.id) return Response.json({ ok: false, error: "invalid_session" }, { status: 401 });
  const access = await allowed(user.id);
  if (!access.allowed) return Response.json({ ok: false, error: "not_authorized_for_voxora" }, { status: 403 });

  const headers = new Headers({ "Content-Type": "application/json" });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  headers.append("Set-Cookie", `${accessCookieName()}=${encodeURIComponent(payload.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(60, payload.expires_in || 3600)}${secure}`);
  if (payload.refresh_token) headers.append("Set-Cookie", `${refreshCookieName()}=${encodeURIComponent(payload.refresh_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
  return new Response(JSON.stringify({ ok: true, data: { name: access.name, email: user.email || email, role: access.role } }), { status: 200, headers });
}
