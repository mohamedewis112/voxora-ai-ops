export function serverRuntimeConfig() {
  const isProd = process.env.NODE_ENV === "production";
  const localDefault = (url: string) => isProd ? "" : url;
  return {
    daleelySupabaseUrl: process.env.DALEELY_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
    daleelyListingsTable: process.env.DALEELY_LISTINGS_TABLE || "listings",
    daleelyUsersTable: process.env.DALEELY_USERS_TABLE || "user_profiles",
    telephonyBackendUrl: process.env.TELEPHONY_BACKEND_URL || "",
    llmUrl: process.env.LLM_URL || localDefault("http://127.0.0.1:11434"),
    llmModel: process.env.LLM_MODEL || "qwen3:4b",
    asrUrl: process.env.ASR_URL || localDefault("http://127.0.0.1:8090"),
    ttsUrl: process.env.TTS_URL || localDefault("http://127.0.0.1:8091"),
    ttsVoice: process.env.TTS_VOICE || "ar_JO-kareem-medium",
    whatsappProvider: process.env.WHATSAPP_PROVIDER || "mock",
  };
}

export function publicReadiness() {
  const c = serverRuntimeConfig();
  return {
    daleelySupabaseConfigured: Boolean(c.daleelySupabaseUrl && c.supabaseSecretKey),
    telephonyConfigured: Boolean(c.telephonyBackendUrl),
    aiConfigured: Boolean(c.llmUrl && c.llmModel),
    asrConfigured: Boolean(c.asrUrl),
    ttsConfigured: Boolean(c.ttsUrl),
    whatsappProvider: c.whatsappProvider,
  };
}
