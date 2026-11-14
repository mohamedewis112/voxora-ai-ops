/**
 * DALEELY INTEGRATION BOUNDARY — notifications adapter.
 * Sends tenant-user notifications through the existing Daleely channels
 * (in-app + future push/SMS/WhatsApp). Production: swap `deliver()` internals
 * for Daleely notification service calls — the success merge/link copy lives in
 * tenantConfig and must remain POSITIVE (never "your activity was deleted").
 */
import { db } from "@/lib/db";
import { tenantConfig } from "@/config/tenant";

export const daleelyNotificationsAdapter = {
  async deliver(input: { userId?: string | null; phone?: string | null; title: string; body: string; type?: string; leadId?: string | null }) {
    return db.opsNotification.create({
      data: {
        targetUserId: input.userId ?? null,
        targetPhone: input.phone ?? null,
        title: input.title,
        body: input.body,
        type: input.type ?? "info",
        leadId: input.leadId ?? null,
      },
    });
  },
  /** Required positive copy for the duplicate→merge→link flow. */
  ownershipLinkedMessage() {
    return { title: "تم ربط نشاطك بنجاح", body: tenantConfig.successLinkMessage, type: "success" as const };
  },
};
