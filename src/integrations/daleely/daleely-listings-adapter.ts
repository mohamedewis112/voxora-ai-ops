/**
 * DALEELY INTEGRATION BOUNDARY — listings adapter.
 * All Daleely-specific listing access lives here. Voxora core modules never query
 * "Daleely" directly — swap this adapter for another tenant without touching core.
 *
 * Production: replace the local-mirror Prisma calls with service-role Supabase
 * queries/RPCs against the EXISTING Daleely tables (listings) — same signatures.
 */
import { db } from "@/lib/db";
import { parseJson } from "@/lib/server/audit";
import type { ListingDTO } from "@/lib/ops-types";

type DbListing = NonNullable<Awaited<ReturnType<typeof db.opsListing.findFirst>>>;

export function toListingDTO(l: DbListing, ownerName?: string | null, ownerRegistered?: boolean): ListingDTO {
  return {
    id: l.id,
    businessName: l.businessName,
    rawPhone: l.rawPhone,
    normalizedPhone: l.normalizedPhone,
    whatsapp: l.whatsapp,
    category: l.category,
    governorate: l.governorate,
    city: l.city,
    village: l.village,
    address: l.address,
    description: l.description,
    logo: l.logo,
    images: parseJson<string[]>(l.images, []),
    socialLinks: parseJson<Record<string, string>>(l.socialLinks, {}),
    website: l.website,
    email: l.email,
    openingHours: l.openingHours,
    products: l.products,
    ownerUserId: l.ownerUserId,
    ownerPhoneNormalized: l.ownerPhoneNormalized,
    status: l.status,
    canonicalListingId: l.canonicalListingId,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    ownerName: ownerName ?? null,
    ownerRegistered: ownerRegistered ?? undefined,
  };
}

export const daleelyListingsAdapter = {
  async findById(id: string) {
    return db.opsListing.findUnique({ where: { id } });
  },
  async findByPhone(normalizedPhone: string) {
    return db.opsListing.findFirst({
      where: { normalizedPhone, status: { not: "merged" }, deletedAt: null },
    });
  },
  /** Public-safe list for ops screens (unclaimed / hidden / closed management). */
  async list(filter: { statuses?: string[]; q?: string; unclaimedOnly?: boolean }) {
    return db.opsListing.findMany({
      where: {
        deletedAt: null,
        ...(filter.statuses?.length ? { status: { in: filter.statuses } } : {}),
        ...(filter.unclaimedOnly ? { ownerUserId: null } : {}),
        ...(filter.q
          ? {
              OR: [
                { businessName: { contains: filter.q } },
                { normalizedPhone: { contains: filter.q } },
                { rawPhone: { contains: filter.q } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  },
  async create(data: {
    businessName: string;
    rawPhone: string;
    normalizedPhone: string;
    whatsapp?: string | null;
    category?: string | null;
    governorate?: string | null;
    city?: string | null;
    village?: string | null;
    address?: string | null;
    description?: string | null;
    ownerUserId?: string | null;
    ownerPhoneNormalized?: string | null;
    status?: string;
    source?: string;
  }) {
    return db.opsListing.create({ data: { ...data, source: data.source ?? "daleely" } as never });
  },
  async updateStatus(id: string, status: string) {
    return db.opsListing.update({ where: { id }, data: { status, updatedAt: new Date() } });
  },
  /** Admin-only restore — listings are never hard-deleted. */
  async restore(id: string) {
    return db.opsListing.update({
      where: { id },
      data: { status: "active", canonicalListingId: null, deletedAt: null, updatedAt: new Date() },
    });
  },
  async softDeleteByAdmin(id: string, reason: string) {
    // Soft delete ONLY; reversible by Admin. Logged via audit() by the caller.
    return db.opsListing.update({ where: { id }, data: { deletedAt: new Date() } as never });
  },
};
