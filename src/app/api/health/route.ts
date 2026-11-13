import { publicReadiness } from "@/lib/server/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, service: "voxora-ai-ops", readiness: publicReadiness(), at: new Date().toISOString() });
}
