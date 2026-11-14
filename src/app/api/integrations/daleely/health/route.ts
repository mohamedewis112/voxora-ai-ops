import { testDaleelySupabase } from "@/integrations/daleely/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await testDaleelySupabase();
    return Response.json({ ok: status.reachable, integration: "daleely", ...status }, { status: status.reachable ? 200 : 503 });
  } catch (e) {
    return Response.json({ ok: false, integration: "daleely", error: e instanceof Error ? e.message : "connection_failed" }, { status: 503 });
  }
}
