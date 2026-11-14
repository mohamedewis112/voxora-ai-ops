/**
 * DALEELY INTEGRATION BOUNDARY — ownership adapter.
 * Owner linking (auto + manual). Production: writes ownership fields via the
 * existing Daleely tables/RPCs + audit, and pushes into ops.owner_link_events.
 */
import { db } from "@/lib/db";
import { audit } from "@/lib/server/audit";
import { tenantConfig } from "@/config/tenant";

export const daleelyOwnershipAdapter = {
  async linkOwner(opts: {
    listingId: string;
    userId: string | null;
    phoneNormalized: string;
    method: "auto" | "manual";
    confidence?: number;
    reason?: string;
    actor: { type: "admin" | "sales_agent" | "system"; id?: string; name?: string };
  }) {
    const listing = await db.opsListing.findUnique({ where: { id: opts.listingId } });
    if (!listing) throw new Error("listing_not_found");

    // Prevent accidental duplicate ownership by a different user
    if (listing.ownerUserId && opts.userId && listing.ownerUserId !== opts.userId) {
      return { linked: false as const, reason: "already_owned_by_other" };
    }

    const updated = await db.opsListing.update({
      where: { id: opts.listingId },
      data: {
        ownerUserId: opts.userId ?? listing.ownerUserId,
        ownerPhoneNormalized: opts.phoneNormalized,
        updatedAt: new Date(),
      },
    });

    await db.ownerLinkEvent.create({
      data: {
        listingId: opts.listingId,
        userId: opts.userId,
        phoneNormalized: opts.phoneNormalized,
        method: opts.method,
        confidence: opts.confidence ?? null,
        reason: opts.reason ?? null,
        actorType: opts.actor.type,
        actorId: opts.actor.id ?? null,
        status: "linked",
      },
    });

    await audit({
      actorType: opts.actor.type,
      actorId: opts.actor.id ?? null,
      action: "ownership.linked",
      entityType: "listing",
      entityId: opts.listingId,
      oldValue: { ownerUserId: listing.ownerUserId },
      newValue: { ownerUserId: opts.userId ?? listing.ownerUserId, method: opts.method },
      source: "owner_linking",
    });

    // Positive notification — NEVER a deletion message
    await db.opsNotification.create({
      data: {
        targetUserId: opts.userId,
        targetPhone: opts.phoneNormalized,
        title: "تم ربط النشاط بنجاح",
        body: tenantConfig.successLinkMessage,
        type: "success",
      },
    });

    return { linked: true as const, listing: updated };
  },

  async rejectCandidate(opts: {
    listingId: string;
    phoneNormalized: string;
    actor: { type: "admin" | "sales_agent"; id?: string };
    reason: string;
  }) {
    await db.ownerLinkEvent.create({
      data: {
        listingId: opts.listingId,
        phoneNormalized: opts.phoneNormalized,
        method: "manual",
        reason: opts.reason,
        actorType: opts.actor.type,
        actorId: opts.actor.id ?? null,
        status: "rejected",
      },
    });
    await audit({
      actorType: opts.actor.type,
      actorId: opts.actor.id ?? null,
      action: "ownership.candidate_rejected",
      entityType: "listing",
      entityId: opts.listingId,
      reason: opts.reason,
      source: "owner_linking",
    });
  },

  /** All businesses with no confirmed owner/account relationship. */
  async listUnclaimed(filter: { q?: string; statuses?: string[] } = {}) {
    return db.opsListing.findMany({
      where: {
        deletedAt: null,
        ownerUserId: null,
        status: { notIn: ["merged"], ...(filter.statuses?.length ? { in: filter.statuses } : {}) },
        ...(filter.q
          ? {
              OR: [
                { businessName: { contains: filter.q } },
                { normalizedPhone: { contains: filter.q } },
                { category: { contains: filter.q } },
                { governorate: { contains: filter.q } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
    });
  },
};
