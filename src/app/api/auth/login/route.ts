import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import { accessCookieName, refreshCookieName, fetchSupabaseUser } from "@/lib/server/voxora-auth";
import { daleelyRest } from "@/integrations/daleely/supabase-server";

export const dynamic = "force-dynamic";

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
  if (!c.daleelySupabaseUrl || !c.supabasePublishableKey) return Response.json({ ok: false, error: "auth_not_configured" }, { status: 503 });
  if (!c.supabaseSecretKey) return Response.json({ ok: false, error: "ops_backend_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({})) as { email?: string; password?: string };
  if (!body.email || !body.password) return Response.json({ ok: false, error: "missing_credentials" }, { status: 400 });
  const r = await fetch(`${c.daleelySupabaseUrl.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: c.supabasePublishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: body.email, password: body.password }),
    cache: "no-store",
  });
  const payload = await r.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; user?: { id?: string; email?: string }; error_description?: string; msg?: string };
  if (!r.ok || !payload.access_token) return Response.json({ ok: false, error: "invalid_credentials" }, { status: 401 });
  const user = payload.user?.id ? payload.user : await fetchSupabaseUser(payload.access_token);
  if (!user?.id) return Response.json({ ok: false, error: "invalid_session" }, { status: 401 });
  const access = await allowed(user.id);
  if (!access.allowed) return Response.json({ ok: false, error: "not_authorized_for_voxora" }, { status: 403 });

  const headers = new Headers({ "Content-Type": "application/json" });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  headers.append("Set-Cookie", `${accessCookieName()}=${encodeURIComponent(payload.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(60, payload.expires_in || 3600)}${secure}`);
  if (payload.refresh_token) headers.append("Set-Cookie", `${refreshCookieName()}=${encodeURIComponent(payload.refresh_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
  return new Response(JSON.stringify({ ok: true, data: { name: access.name, email: user.email || body.email, role: access.role } }), { status: 200, headers });
}
