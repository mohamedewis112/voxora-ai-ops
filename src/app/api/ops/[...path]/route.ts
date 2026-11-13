/** Voxora AI ops boundary. Hosted deployments never fall back to demo data. */
import { handleOpsGet, handleOpsPost } from "@/lib/server/ops-router";
import { handleSupabaseOpsGet, handleSupabaseOpsPost } from "@/lib/server/supabase-ops-router";
import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import { requireVoxoraActor } from "@/lib/server/voxora-auth";

export const dynamic = "force-dynamic";

function hostedOps() {
  const c = serverRuntimeConfig();
  return process.env.NODE_ENV === "production" || Boolean(c.daleelySupabaseUrl);
}

function backendUnavailable() {
  return Response.json(
    { ok: false, error: "ops_backend_not_configured" },
    { status: 503 }
  );
}

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  try {
    if (hostedOps()) {
      const c = serverRuntimeConfig();
      if (!c.daleelySupabaseUrl || !c.supabaseSecretKey) return backendUnavailable();
      const auth = await requireVoxoraActor(req);
      if (auth.response) return auth.response;
      return await handleSupabaseOpsGet(path ?? [], req, auth.actor!);
    }
    return await handleOpsGet(path ?? [], req);
  } catch (e) {
    console.error("ops GET error", e);
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  try {
    if (hostedOps()) {
      const c = serverRuntimeConfig();
      if (!c.daleelySupabaseUrl || !c.supabaseSecretKey) return backendUnavailable();
      const auth = await requireVoxoraActor(req);
      if (auth.response) return auth.response;
      return await handleSupabaseOpsPost(path ?? [], req, auth.actor!);
    }
    return await handleOpsPost(path ?? [], req);
  } catch (e) {
    console.error("ops POST error", e);
    return Response.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}
