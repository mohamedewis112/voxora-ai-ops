/**
 * Voxora AI — CRITICAL: business duplicate detection & safe merge.
 *
 * Rules (from ops spec):
 *  - Matching considers normalized phone, business name, owner phone, category,
 *    governorate/city, address — NEVER name similarity alone for auto-merge.
 *  - Confidence levels: >=85 strong (exact phone based) → auto-merge allowed.
 *    55–84 → pending manual review (MergeJob). <55 → treated as separate listing.
 *  - Auto-merge is NEVER destructive: duplicate becomes status=merged with
 *    canonicalListingId, field-level history stored, fully reversible by Admin.
 *  - Owner receives the SUCCESS message (tenant.successLinkMessage) — never a
 *    "deleted" message.
 */
import { db } from "@/lib/db";
import { parseJson } from "./audit";
import { nameSimilarity, normalizePhone } from "./phone";
import { tenantConfig } from "@/config/tenant";

export interface DuplicateMatch {
  listingId: string;
  confidence: number;
  reasons: { code: string; label: string; score: number }[];
}

export function confidenceTier(confidence: number): "auto" | "review" | "none" {
  if (confidence >= 85) return "auto";
  if (confidence >= 55) return "review";
  return "none";
}

/** Compare a candidate (new submission) against all existing listings. */
export async function findDuplicates(candidate: {
  businessName: string;
  phone: string;
  category?: string | null;
  governorate?: string | null;
  city?: string | null;
}): Promise<DuplicateMatch[]> {
  const norm = normalizePhone(candidate.phone);
  if (!norm.ok) return [];

  const listings = await db.opsListing.findMany({
    where: { status: { notIn: ["merged"] }, deletedAt: null },
  });

  const matches: DuplicateMatch[] = [];
  for (const l of listings) {
    const reasons: DuplicateMatch["reasons"] = [];
    let score = 0;

    const phoneExact = l.normalizedPhone === norm.canonical;
    if (phoneExact) {
      score += 88;
      reasons.push({ code: "exact_phone", label: "تطابق تام في رقم الهاتف", score: 88 });
    }

    const nameSim = nameSimilarity(candidate.businessName, l.businessName);
    if (nameSim >= 0.95) {
      score += 62;
      reasons.push({ code: "very_similar_name", label: `تطابق اسم النشاط بنسبة عالية (${Math.round(nameSim * 100)}%)`, score: 62 });
    } else if (nameSim >= 0.8) {
      score += 30;
      reasons.push({ code: "similar_name", label: `تشابه اسم النشاط (${Math.round(nameSim * 100)}%)`, score: 30 });
    }

    if (l.category && candidate.category && l.category === candidate.category) {
      score += 3;
      reasons.push({ code: "same_category", label: "نفس التصنيف", score: 3 });
    }
    if (l.governorate && candidate.governorate && l.governorate === candidate.governorate) {
      score += 2;
      reasons.push({ code: "same_governorate", label: "نفس المحافظة", score: 2 });
    }
    if (l.city && candidate.city && l.city === candidate.city) {
      score += 2;
      reasons.push({ code: "same_city", label: "نفس المدينة/المركز", score: 2 });
    }

    // Name-only similarity must never auto-merge: cap below 85.
    if (!phoneExact && score >= 85) score = 84;

    score = Math.min(99, score);
    if (score >= 55) matches.push({ listingId: l.id, confidence: score, reasons });
  }
  return matches.sort((a, b) => b.confidence - a.confidence);
}

export interface MergeOutcome {
  merged: boolean;
  mergeJobId: string;
  canonicalListingId: string;
  fieldChanges: { field: string; action: string; kept: unknown; from: unknown }[];
}

/**
 * Field-level safe merge. Existing (canonical) data always wins for populated
 * fields; empty canonical fields are filled from the new listing; images are
 * appended (dedup). Conflicting values stay preserved in fieldChanges history.
 */
export async function mergeListings(opts: {
  canonicalId: string;
  duplicateId: string;
  confidence: number;
  reasons: DuplicateMatch["reasons"];
  actor: { type: "admin" | "sales_agent" | "system" | "ai_agent"; id?: string; name?: string };
  auto: boolean;
  source?: string;
}): Promise<MergeOutcome> {
  const canonical = await db.opsListing.findUnique({ where: { id: opts.canonicalId } });
  const duplicate = await db.opsListing.findUnique({ where: { id: opts.duplicateId } });
  if (!canonical || !duplicate) throw new Error("listing_not_found");

  const dupImages = parseJson<string[]>(duplicate.images, []);
  const canImages = parseJson<string[]>(canonical.images, []);
  const appendedImages = dupImages.filter((img) => !canImages.includes(img));

  const dupSocial = parseJson<Record<string, string>>(duplicate.socialLinks, {});
  const canSocial = parseJson<Record<string, string>>(canonical.socialLinks, {});

  const changes: MergeOutcome["fieldChanges"] = [];
  const fillData: Record<string, string> = {};

  const consider = (field: string, current: string | null, incoming: string | null) => {
    if (!incoming) return;
    if (!current) {
      fillData[field] = incoming;
      changes.push({ field, action: "filled_from_new", kept: null, from: incoming });
    } else if (current !== incoming) {
      changes.push({ field, action: "kept_existing", kept: current, from: incoming });
    }
  };

  consider("logo", canonical.logo, duplicate.logo);
  // description: fill only if missing or clearly shorter
  if (duplicate.description) {
    if (!canonical.description) {
      fillData.description = duplicate.description;
      changes.push({ field: "description", action: "filled_from_new", kept: null, from: duplicate.description });
    } else if (duplicate.description.length > canonical.description.length) {
      changes.push({ field: "description", action: "kept_existing", kept: canonical.description, from: duplicate.description });
    }
  }
  consider("category", canonical.category, duplicate.category);
  consider("specialization", canonical.specialization, duplicate.specialization);
  consider("whatsapp", canonical.whatsapp, duplicate.whatsapp);
  consider("address", canonical.address, duplicate.address);
  consider("governorate", canonical.governorate, duplicate.governorate);
  consider("city", canonical.city, duplicate.city);
  consider("village", canonical.village, duplicate.village);
  consider("website", canonical.website, duplicate.website);
  consider("email", canonical.email, duplicate.email);
  consider("openingHours", canonical.openingHours, duplicate.openingHours);
  consider("products", canonical.products, duplicate.products);

  const socialKeys = Object.keys(dupSocial);
  const socialFilled: Record<string, string> = {};
  for (const k of socialKeys) {
    if (!canSocial[k]) {
      socialFilled[k] = dupSocial[k];
      changes.push({ field: `social.${k}`, action: "filled_from_new", kept: null, from: dupSocial[k] });
    }
  }
  if (appendedImages.length > 0) {
    changes.push({ field: "images", action: "appended", kept: canImages.length, from: appendedImages.length });
  }

  // 1) apply merge to canonical
  const updated = await db.opsListing.update({
    where: { id: canonical.id },
    data: {
      ...fillData,
      ...(Object.keys(socialFilled).length
        ? { socialLinks: JSON.stringify({ ...canSocial, ...socialFilled }) }
        : {}),
      ...(appendedImages.length
        ? { images: JSON.stringify([...canImages, ...appendedImages]) }
        : {}),
    },
  });

  // 2) duplicate → merged (soft, reversible) + canonical pointer
  await db.opsListing.update({
    where: { id: duplicate.id },
    data: { status: "merged", canonicalListingId: canonical.id, updatedAt: new Date() },
  });

  // 3) merge job record with full field history
  const job = await db.mergeJob.create({
    data: {
      canonicalListingId: canonical.id,
      duplicateListingId: duplicate.id,
      confidence: opts.confidence,
      reasons: JSON.stringify(opts.reasons),
      status: opts.auto ? "auto_merged" : "merged",
      fieldChanges: JSON.stringify(changes),
      reviewedById: opts.actor.id ?? null,
      reviewedAt: new Date(),
    },
  });

  // 4) owner linking: if the duplicate carried owner info → link event on canonical
  if (duplicate.ownerUserId || duplicate.ownerPhoneNormalized) {
    if (!updated.ownerUserId) {
      await db.opsListing.update({
        where: { id: canonical.id },
        data: {
          ownerUserId: duplicate.ownerUserId,
          ownerPhoneNormalized: duplicate.ownerPhoneNormalized,
        },
      });
    }
    await db.ownerLinkEvent.create({
      data: {
        listingId: canonical.id,
        userId: duplicate.ownerUserId,
        phoneNormalized: duplicate.ownerPhoneNormalized ?? duplicate.normalizedPhone,
        method: "auto",
        confidence: opts.confidence,
        reason: "owner_carry_over_from_merged_duplicate",
        actorType: opts.actor.type,
        actorId: opts.actor.id ?? null,
        status: "linked",
      },
    });
  }

  // 5) audit — both sides, full history, reversible
  await db.auditLog.createMany({
    data: [
      {
        actorType: opts.actor.type,
        actorId: opts.actor.id ?? null,
        action: opts.auto ? "merge.auto_merged" : "merge.merged",
        entityType: "listing",
        entityId: canonical.id,
        oldValue: JSON.stringify({ status: canonical.status, imagesCount: canImages.length }),
        newValue: JSON.stringify({ imagesCount: canImages.length + appendedImages.length, filled: Object.keys(fillData) }),
        reason: `duplicate_merged_conf_${opts.confidence}`,
        source: opts.source ?? "duplicate_check",
        metadata: JSON.stringify({ duplicateId: duplicate.id, fieldChanges: changes }),
      },
      {
        actorType: opts.actor.type,
        actorId: opts.actor.id ?? null,
        action: "listing.status_changed",
        entityType: "listing",
        entityId: duplicate.id,
        oldValue: JSON.stringify({ status: duplicate.status }),
        newValue: JSON.stringify({ status: "merged", canonicalListingId: canonical.id }),
        reason: "duplicate_of_canonical",
        source: opts.source ?? "duplicate_check",
        metadata: JSON.stringify({ canonicalListingId: canonical.id, reversible: true }),
      },
    ],
  });

  // 6) SUCCESS notification to the owner (positive ownership-linking experience)
  if (duplicate.ownerUserId || duplicate.ownerPhoneNormalized) {
    await db.opsNotification.create({
      data: {
        targetUserId: duplicate.ownerUserId,
        targetPhone: duplicate.ownerPhoneNormalized ?? duplicate.ownerPhoneNormalized,
        title: "تم ربط نشاطك بنجاح",
        body: tenantConfig.successLinkMessage,
        type: "success",
      },
    });
  }

  // 7) timeline on any lead attached to that phone
  const lead = await db.opsLead.findUnique({ where: { normalizedPhone: duplicate.normalizedPhone } });
  if (lead) {
    await db.timelineEvent.create({
      data: {
        leadId: lead.id,
        type: "listing_merged",
        actorType: opts.actor.type === "admin" ? "admin" : "system",
        actorId: opts.actor.id ?? null,
        actorName: opts.actor.name ?? null,
        title: "تم دمج النشاط المكرر في النشاط الأصلي",
        data: JSON.stringify({ canonicalId: canonical.id, duplicateId: duplicate.id, confidence: opts.confidence }),
      },
    });
  }

  return { merged: true, mergeJobId: job.id, canonicalListingId: canonical.id, fieldChanges: changes };
}
