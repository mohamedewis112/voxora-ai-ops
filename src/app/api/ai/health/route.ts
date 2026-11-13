import { serverRuntimeConfig } from "@/lib/server/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const { llmUrl, llmModel } = serverRuntimeConfig();
  try {
    const r = await fetch(`${llmUrl.replace(/\/$/, "")}/api/tags`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    if (!r.ok) return Response.json({ ok: false, configured: true, reachable: false, model: llmModel, status: r.status }, { status: 503 });
    const body = await r.json() as { models?: Array<{ name?: string; model?: string }> };
    const names = (body.models ?? []).map((m) => m.name || m.model || "");
    return Response.json({ ok: true, configured: true, reachable: true, model: llmModel, installed: names.some((n) => n === llmModel || n.startsWith(`${llmModel}:`)), models: names.slice(0, 20) });
  } catch (e) {
    return Response.json({ ok: false, configured: true, reachable: false, model: llmModel, error: e instanceof Error ? e.message : "unreachable" }, { status: 503 });
  }
}
