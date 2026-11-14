/**
 * Voxora AI — tenant configuration.
 * Daleely is the FIRST tenant only. Everything tenant-specific lives here and in
 * `src/integrations/daleely/*` — never hardcode tenant names/ids in core modules.
 */
export interface TenantConfig {
  id: string;
  name: string; // display name (ar)
  nameEn: string;
  entityLabel: { ar: string; en: string }; // business entity terminology
  registeredBadge: string; // shown when a customer phone matches an existing account
  successLinkMessage: string; // REQUIRED positive message on merge/link — never "deleted"
  databaseAdapter: "local-mirror" | "supabase-daleely";
  featureFlags: {
    whatsapp: boolean;
    aiBot: boolean;
    duplicateMerge: boolean;
  };
}

export const tenantConfig: TenantConfig = {
  id: "daleely",
  name: "دليلي",
  nameEn: "Daleely",
  entityLabel: { ar: "نشاط", en: "business" },
  registeredBadge: "مسجل في دليلي",
  successLinkMessage: "تم ربط نشاطك بحسابك بنجاح وتم تحديث بيانات النشاط",
  databaseAdapter: process.env.NEXT_PUBLIC_DALEELY_ADAPTER === "supabase" ? "supabase-daleely" : "local-mirror",
  featureFlags: { whatsapp: true, aiBot: true, duplicateMerge: true },
};
