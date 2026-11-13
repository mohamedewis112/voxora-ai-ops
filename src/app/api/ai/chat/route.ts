import { serverRuntimeConfig } from "@/lib/server/runtime-config";
import { requireVoxoraActor } from "@/lib/server/voxora-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireVoxoraActor(req); if (auth.response) return auth.response;
  const { llmUrl, llmModel } = serverRuntimeConfig();
  const input = await req.json().catch(() => ({})) as { messages?: Array<{ role: string; content: string }>; system?: string };
  const messages = Array.isArray(input.messages) ? input.messages.slice(-30) : [];
  if (!messages.length) return Response.json({ ok: false, error: "messages_required" }, { status: 400 });

  const system = input.system || "أنت موظف مبيعات وخدمة عملاء محترف. تحدث بالعربية المصرية باختصار واحترام. لا تدّع معلومات غير موجودة، واحترم طلب عدم التواصل.";
  try {
    const r = await fetch(`${llmUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: llmModel, stream: false, messages: [{ role: "system", content: system }, ...messages] }),
      signal: AbortSignal.timeout(90000),
    });
    const body = await r.json().catch(() => null);
    if (!r.ok) return Response.json({ ok: false, error: "llm_error", details: body }, { status: 502 });
    return Response.json({ ok: true, model: llmModel, message: body?.message ?? null });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "llm_unreachable" }, { status: 503 });
  }
}
