import { serverRuntimeConfig } from "@/lib/server/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const { telephonyBackendUrl } = serverRuntimeConfig();
  if (!telephonyBackendUrl) return Response.json({ ok: false, configured: false, reachable: false }, { status: 503 });
  try {
    const r = await fetch(`${telephonyBackendUrl.replace(/\/$/, "")}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return Response.json({ ok: r.ok, configured: true, reachable: r.ok, status: r.status }, { status: r.ok ? 200 : 503 });
  } catch (e) {
    return Response.json({ ok: false, configured: true, reachable: false, error: e instanceof Error ? e.message : "unreachable" }, { status: 503 });
  }
}
