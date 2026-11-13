import { authorizeVoxoraRequest } from "@/lib/server/voxora-auth";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const actor = await authorizeVoxoraRequest(req);
  if (!actor) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return Response.json({ ok: true, data: actor });
}
