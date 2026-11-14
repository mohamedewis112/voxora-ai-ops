import { accessCookieName, refreshCookieName, salesCookieName } from "@/lib/server/voxora-auth";
export async function POST() {
  const headers = new Headers({ "Content-Type": "application/json" });
  headers.append("Set-Cookie", `${accessCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  headers.append("Set-Cookie", `${refreshCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  headers.append("Set-Cookie", `${salesCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return new Response(JSON.stringify({ ok: true }), { headers });
}
