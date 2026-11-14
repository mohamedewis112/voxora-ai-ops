import { authorizeVoxoraRequest } from "@/lib/server/voxora-auth";

export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
      "Vary": "Cookie",
    },
  });
}

export async function GET(req: Request) {
  const actor = await authorizeVoxoraRequest(req);
  if (!actor) return json({ ok: false, error: "unauthorized" }, 401);
  return json({ ok: true, data: actor });
}
