import { serverRuntimeConfig } from "@/lib/server/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const c = serverRuntimeConfig();
  return Response.json({
    ok: true,
    service: "voxora-sales",
    readiness: {
      daleelyConfigured: Boolean(c.daleelySupabaseUrl && c.supabasePublishableKey),
      salesAuthConfigured: Boolean(c.voxoraAppKey && c.voxoraSessionSecret),
    },
    at: new Date().toISOString(),
  });
}
