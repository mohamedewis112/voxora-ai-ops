import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    service: "Voxora AI Ops API",
    version: "0.3.0",
    status: "ok",
    endpoints: {
      health: `${origin}/api/health`,
      ops: `${origin}/api/ops`,
      daleely: `${origin}/api/integrations/daleely/health`,
      ai: `${origin}/api/ai/health`,
      aiChat: `${origin}/api/ai/chat`,
      telephony: `${origin}/api/telephony/health`,
    },
  });
}
