import { serverRuntimeConfig } from "@/lib/server/runtime-config";

/**
 * Server-only Supabase REST helper for the existing Daleely project.
 * Supports the modern `sb_secret_...` key as well as the legacy service-role JWT.
 * Modern secret keys MUST be sent in the `apikey` header, not as a Bearer token.
 */
function headers(extra: HeadersInit = {}) {
  const { supabaseSecretKey } = serverRuntimeConfig();
  const out: Record<string, string> = {
    apikey: supabaseSecretKey,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  // Legacy service-role keys are JWTs and may also be used as the bearer token.
  if (supabaseSecretKey && !supabaseSecretKey.startsWith("sb_secret_")) {
    out.Authorization = `Bearer ${supabaseSecretKey}`;
  }
  if (extra instanceof Headers) extra.forEach((v, k) => { out[k] = v; });
  else if (Array.isArray(extra)) for (const [k, v] of extra) out[k] = v;
  else Object.assign(out, extra || {});
  return out;
}

export function daleelySupabaseConfigured() {
  const { daleelySupabaseUrl, supabaseSecretKey } = serverRuntimeConfig();
  return Boolean(daleelySupabaseUrl && supabaseSecretKey);
}

export async function daleelyRest(path: string, init: RequestInit = {}) {
  const { daleelySupabaseUrl } = serverRuntimeConfig();
  if (!daleelySupabaseConfigured()) throw new Error("daleely_supabase_not_configured");
  return fetch(`${daleelySupabaseUrl.replace(/\/$/, "")}/rest/v1/${path.replace(/^\//, "")}`, {
    ...init,
    headers: headers(init.headers),
    cache: "no-store",
  });
}

export async function daleelyRpc<T = unknown>(fn: string, body: Record<string, unknown> = {}): Promise<T> {
  const r = await daleelyRest(`rpc/${encodeURIComponent(fn)}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const payload = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`daleely_rpc_${fn}_${r.status}:${JSON.stringify(payload)}`);
  return payload as T;
}

export async function testDaleelySupabase() {
  const c = serverRuntimeConfig();
  if (!daleelySupabaseConfigured()) return { configured: false, reachable: false, table: c.daleelyListingsTable };
  const r = await daleelyRest(`${encodeURIComponent(c.daleelyListingsTable)}?select=id&limit=1`, { headers: { Prefer: "count=none" } });
  return { configured: true, reachable: r.ok, status: r.status, table: c.daleelyListingsTable };
}
