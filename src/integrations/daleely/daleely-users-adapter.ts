/**
 * DALEELY INTEGRATION BOUNDARY — users adapter.
 * Phone-first identity resolution against the existing Daleely accounts.
 * Production: service-role Supabase queries on auth.users + profiles by phone.
 */
import { db } from "@/lib/db";
import type { OwnerCandidateDTO } from "@/lib/ops-types";

export const daleelyUsersAdapter = {
  async findByPhone(normalizedPhone: string) {
    return db.opsUser.findUnique({ where: { normalizedPhone } });
  },
  async findById(id: string) {
    return db.opsUser.findUnique({ where: { id } });
  },
  async create(data: { fullName: string; rawPhone: string; normalizedPhone: string; isRegistered?: boolean; email?: string | null }) {
    return db.opsUser.create({ data });
  },
  /** Candidates that could own a listing: same phone, or similar name (scored). */
  async ownerCandidates(normalizedPhone: string, businessName: string): Promise<OwnerCandidateDTO[]> {
    const { nameSimilarity } = await import("@/lib/server/phone");
    const users = await db.opsUser.findMany();
    const out: OwnerCandidateDTO[] = [];
    for (const u of users) {
      if (u.normalizedPhone === normalizedPhone) {
        out.push({
          userId: u.id,
          fullName: u.fullName,
          normalizedPhone: u.normalizedPhone,
          isRegistered: u.isRegistered,
          matchScore: 92,
          matchReason: "نفس رقم الهاتف المسجل",
        });
        continue;
      }
      const sim = nameSimilarity(u.fullName, businessName);
      if (sim >= 0.6) {
        out.push({
          userId: u.id,
          fullName: u.fullName,
          normalizedPhone: u.normalizedPhone,
          isRegistered: u.isRegistered,
          matchScore: Math.round(sim * 60),
          matchReason: `تشابه الاسم (${Math.round(sim * 100)}%) — يحتاج تأكيدًا يدويًا`,
        });
      }
    }
    return out.sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);
  },
};
